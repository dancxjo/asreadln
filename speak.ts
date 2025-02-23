#!/bin/env -S deno run -A
import { split } from "npm:sentence-splitter";
import { streamPlay } from "./streamplay.ts";
import emojiRegex from "npm:emoji-regex"

let buffer = "";
const emojis = emojiRegex();
const decoder = new TextDecoder();
// console.log("a");
for await (const chunk of Deno.stdin.readable) {
    // console.log("b");
    const text = decoder.decode(chunk);
    buffer += text;
    const sentences = split(buffer);

    if (sentences.length > 1) {
        // console.log("c");
        const firstSentence = sentences.shift();
        const s = firstSentence?.raw.trim().replaceAll(emojis, "").replaceAll("*", "");
        // console.log(s);
        if (s) {
            // console.log("d");
            // console.log("Playing sentence", s);
            await streamPlay(s);
            // console.log("e");
        }
        buffer = sentences.map((s) => s.raw).join("");
        // console.log("f");
        // console.log(buffer);
    }

    // console.log('g');
}

// console.log('h');
buffer = buffer.trim().replaceAll(emojis, "").replaceAll("*", "");
// console.log(buffer);
if (buffer) {
    // console.log("i");
    // console.log("Flush Playing sentence", buffer);

    await streamPlay(buffer);
    // console.log("j");
}
// console.log("k");
// Not sure why this is needed, but it is
Deno.exit(0);

