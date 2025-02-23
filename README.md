# asreadln

## Overview
`asreadln` is a **speech-to-text processor** designed as a **drop-in replacement for `readln`** (as used in ncurses and similar environments). It integrates **voice activity detection (VAD)** with **Whisper speech recognition**, making it ideal for **Unix-like shell scripts**, particularly in **`shellm.sh`**.

## Features
- **Drop-in replacement for `readln`**
- **Uses WebRTC VAD** to detect speech dynamically
- **Integrates Whisper AI** for transcription
- **Configurable through command-line options** (VAD mode, silence thresholds, language, etc.)
- **Supports GPU acceleration** if available

## Installation
### Dependencies
Ensure you have:
- Rust (`cargo` and `rustc`)
- `whisper-rs` with a **Whisper model** (`ggml-base.en.bin` or another supported model)

### Building
```sh
cargo build --release
```

### Running
```sh
target/release/asreadln --language en
```

## Usage
### Basic Invocation
```sh
arecord -f S16_LE -r 16000 -c 1 | asreadln
```
This will **record speech from your microphone** and **pipe the audio into `asreadln`** for processing.

Alternatively, you can use an existing audio file:
```sh
cat speech.wav | asreadln
```

### Command-line Options
| Option | Description | Default |
|--------|-------------|---------|
| `--vad-mode` | VAD mode (`Quality`, `LowBitrate`, `Aggressive`, `VeryAggressive`) | `VeryAggressive` |
| `--frame-size` | Audio frame size (samples) | `160` |
| `--silence-threshold` | Silence frames before ending speech | `70` |
| `--silence-debounce-threshold` | Silence debounce threshold | `5` |
| `--initial-silence-threshold` | Allowable initial silence before activation | `50` |
| `--finished-threshold` | Confirmed silence before exiting | `2` |
| `--language` | Language for transcription | `en` |

## Example: Using in a Shell Script
```sh
#!/bin/bash
echo "Speak now:"
text=$(arecord -f S16_LE -r 16000 -c 1 | asreadln)
echo "You said: $text"
```

## License
MIT License

## Author
Developed as part of `shellm.sh` for seamless speech-to-text integration.
