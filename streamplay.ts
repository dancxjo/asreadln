import { MsEdgeTTS, OUTPUT_FORMAT } from "npm:msedge-tts";

// Initialize the TTS service
const tts = new MsEdgeTTS();
await tts.setMetadata("en-US-AnaNeural", OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS);

/**
 * Directly plays speech from a text string using the ffplay command.
 * @param text The text to play as speech
 */
export async function streamPlay(text: string) {
    // Convert the text to a readable stream
    const { audioStream: readable } = await tts.toStream(text); // Ensure we await it

    // Spawn the ffplay process to play the stream directly
    const command = new Deno.Command("ffplay", {
        args: [
            "-i", "pipe:0",  // Input from stdin (pipe)
            "-autoexit",     // Automatically exit when playback finishes
            "-nodisp"        // No display window (for audio-only)
        ],
        stdin: "piped",
        stdout: "piped",
        stderr: "piped",
    });

    const ffplayProcess = command.spawn();
    const writer = ffplayProcess.stdin.getWriter();

    // Write each chunk of the TTS stream to ffplay stdin for immediate playback
    try {
        for await (const chunk of readable) {
            await writer.write(chunk);
        }
    } catch (error) {
        console.error("Error writing to ffplay:", error);
    } finally {
        await writer.close(); // Close stdin properly
    }

    // Await the process completion
    const response = await ffplayProcess.output();

    // console.log("ffplay process completed with code:", response.code);

    if (!response.success) {
        const errorText = new TextDecoder().decode(response.stderr);
        console.error("ffplay error:", errorText);
    }
}
