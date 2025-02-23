#!/usr/bin/env -S deno run -A
import { Message, Ollama } from "npm:ollama";
import yargs from "npm:yargs";
import { history, saveHistory } from "./history.ts";

const argv = yargs(Deno.args)
  .option("system", {
    type: "string",
    describe: "system string",
  })
  .parse();

const filename = argv.shebang;
let input = "";

if (filename) {
  try {
    input = Deno.readTextFileSync(filename);
  } catch (error) {
    console.error(`Error reading file: ${error}`);
    Deno.exit(1);
  }
} else {
  // Exhaust stdin into a string
  const decoder = new TextDecoder();
  for await (const chunk of Deno.stdin.readable) {
    const text = decoder.decode(chunk);
    input += text;
  }
}

const ollama = new Ollama({ host: "http://forebrain.local:11434" });


history.push({ role: "user", content: input });
saveHistory();

// function abbreviateHistory(history: Message[], maxLength: number): Message[] {
//   let length = 0;
//   let i = history.length - 1;
//   while (length < maxLength && i >= 0) {
//     length += history[i].content.length;
//     i--;
//   }
//   return history.slice(i + 1);
// }


const stream = await ollama.chat({
  model: "gemma2:27b",
  messages: [
    { role: "system", content: argv.system },
    ...history,
  ],
  stream: true,
});

let fullResponse = "";
for await (const chunk of stream) {
  const text = chunk.message.content;
  fullResponse += text;
  Deno.stdout.writeSync(new TextEncoder().encode(text));
}
history.push({ role: "assistant", content: fullResponse });
saveHistory();

console.log();
