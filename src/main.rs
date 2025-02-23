use bytemuck;
use clap::{Arg, Command};
use std::io::{self, Read, Write};
use webrtc_vad::{Vad, VadMode};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

const SAMPLE_RATE: usize = 16000; // Ensure this matches the incoming audio

#[derive(Debug, PartialEq)]
enum SpeechState {
    AwaitingSpeech,
    Listening,
    PossiblyEnding,
}

fn main() {
    let matches = Command::new("asreadln")
        .about("Speech-to-text processor using VAD and Whisper")
        .arg(
            Arg::new("vad_mode")
                .long("vad-mode")
                .default_value("VeryAggressive")
                .help("Set the VAD mode: Quality, LowBitrate, Aggressive, or VeryAggressive"),
        )
        .arg(
            Arg::new("frame_size")
                .long("frame-size")
                .default_value("160")
                .help("Set the frame size in samples"),
        )
        .arg(
            Arg::new("silence_threshold")
                .long("silence-threshold")
                .default_value("70")
                .help("Set the silence threshold (frames) before ending speech"),
        )
        .arg(
            Arg::new("silence_debounce_threshold")
                .long("silence-debounce-threshold")
                .default_value("5")
                .help("Set the silence debounce threshold"),
        )
        .arg(
            Arg::new("initial_silence_threshold")
                .long("initial-silence-threshold")
                .default_value("50")
                .help("Set the initial silence threshold before activation"),
        )
        .arg(
            Arg::new("finished_threshold")
                .long("finished-threshold")
                .default_value("2")
                .help("Set the number of times silence must be confirmed before finishing"),
        )
        .arg(
            Arg::new("language")
                .long("language")
                .default_value("en")
                .help("Set the language for transcription"),
        )
        .get_matches();

    let vad_mode = match matches.get_one::<String>("vad_mode").unwrap().as_str() {
        "Quality" => VadMode::Quality,
        "LowBitrate" => VadMode::LowBitrate,
        "Aggressive" => VadMode::Aggressive,
        "VeryAggressive" => VadMode::VeryAggressive,
        _ => VadMode::VeryAggressive,
    };

    let frame_size = matches
        .get_one::<String>("frame_size")
        .unwrap()
        .parse()
        .unwrap_or(SAMPLE_RATE / 100);
    let silence_threshold = matches
        .get_one::<String>("silence_threshold")
        .unwrap()
        .parse()
        .unwrap_or(100);
    let silence_debounce_threshold = matches
        .get_one::<String>("silence_debounce_threshold")
        .unwrap()
        .parse()
        .unwrap_or(5);
    let initial_silence_threshold = matches
        .get_one::<String>("initial_silence_threshold")
        .unwrap()
        .parse()
        .unwrap_or(50);
    let finished_threshold = matches
        .get_one::<String>("finished_threshold")
        .unwrap()
        .parse()
        .unwrap_or(2);
    let language = matches.get_one::<String>("language").unwrap();

    let mut vad = Vad::new_with_mode(vad_mode);
    let mut stdin = io::stdin().lock();
    let mut buffer = vec![0i16; frame_size];
    let mut audio_buffer = Vec::new(); // Store normalized f32 samples
    let mut state = SpeechState::AwaitingSpeech;
    let mut silence_counter = 0;
    let mut initial_silence_counter = 0;
    let mut finished_counter = 0;
    let mut should_exit = false; // Flag to determine loop termination

    unsafe {
        whisper_rs::set_log_callback(Some(log_callback), std::ptr::null_mut());
    }

    // Run Whisper transcription
    let mut whisper_context_params = WhisperContextParameters::default();
    whisper_context_params.use_gpu = true;
    let whisper_ctx =
        WhisperContext::new_with_params("models/ggml-base.en.bin", whisper_context_params)
            .expect("Failed to load Whisper model");
    let mut whisper_state = whisper_ctx.create_state().expect("failed to create state");

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });

    params.set_language(Some(language)); // Set language
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    while !should_exit {
        // Read exactly frame_size samples (320 bytes for 16-bit PCM)
        if stdin
            .read_exact(bytemuck::cast_slice_mut(&mut buffer))
            .is_err()
        {
            break;
        }

        // Normalize and store f32 samples
        let normalized_samples: Vec<f32> =
            buffer.iter().map(|&s| s as f32 / i16::MAX as f32).collect();
        audio_buffer.extend_from_slice(&normalized_samples);

        // Run VAD
        match vad.is_voice_segment(&buffer) {
            Ok(true) => {
                silence_counter = 0;
                initial_silence_counter = 0;
                if state == SpeechState::AwaitingSpeech || state == SpeechState::PossiblyEnding {
                    state = SpeechState::Listening;
                    eprint!("\rListening...      ");
                }
            }
            Ok(false) => {
                if state == SpeechState::AwaitingSpeech {
                    // Count frames in initial silence before we "activate"
                    initial_silence_counter += 1;
                    if initial_silence_counter < initial_silence_threshold {
                        continue;
                    }
                }

                silence_counter += 1;

                if silence_counter >= silence_threshold {
                    if state != SpeechState::AwaitingSpeech {
                        finished_counter += 1;
                        if finished_counter >= finished_threshold {
                            eprintln!("\rFinished                      ");
                            should_exit = true;
                        }
                    }
                    state = SpeechState::AwaitingSpeech;
                } else if silence_counter >= silence_debounce_threshold
                    && state == SpeechState::Listening
                {
                    state = SpeechState::PossiblyEnding;
                    eprint!("\rPossibly ending   ");
                }
            }
            Err(_) => eprint!("\rInvalid frame length"),
        }

        io::stdout().flush().unwrap();
    }

    whisper_state
        .full(params, &audio_buffer)
        .expect("Whisper failed");

    let num_segments = whisper_state
        .full_n_segments()
        .expect("failed to get number of segments");
    for i in 0..num_segments {
        let segment = whisper_state
            .full_get_segment_text(i)
            .expect("failed to get segment");
        let _start_timestamp = whisper_state
            .full_get_segment_t0(i)
            .expect("failed to get segment start timestamp");
        let _end_timestamp = whisper_state
            .full_get_segment_t1(i)
            .expect("failed to get segment end timestamp");
        println!("{}", segment);
    }
}

unsafe extern "C" fn log_callback(_level: u32, _message: *const i8, _: *mut std::ffi::c_void) {
    // Suppress Whisper logs
}
