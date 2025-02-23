#!/usr/bin/env -S deno run -A

import { parse } from "npm:shell-quote";

const decoder = new TextDecoder();
const encoder = new TextEncoder();
const { Command } = Deno;

const State = {
  TEXT: "TEXT",
  FUNCTION_TAG_OPEN: "FUNCTION_TAG_OPEN",
  FUNCTION_TAG_EXECUTION: "FUNCTION_TAG_EXECUTION",
  STREAMING: "STREAMING",
  END_TAG_DETECTION: "END_TAG_DETECTION",
};

let state = State.TEXT;
let buffer = "";
let commandProcess = null;
let commandWriter = null;

for await (const chunk of Deno.stdin.readable) {
  const text = decoder.decode(chunk, { stream: true });

  let i = 0;
  while (i < text.length) {
    const char = text[i];

    switch (state) {
      case State.TEXT:
        if (char === "<") {
          state = State.FUNCTION_TAG_OPEN;
          buffer = "<";
        } else {
          // We don't need to preserve the surrounding messages
          // Deno.stdout.writeSync(encoder.encode(char));
        }
        break;

      case State.FUNCTION_TAG_OPEN:
        buffer += char;
        if (buffer === "<function") {
          buffer = "";
          state = State.FUNCTION_TAG_EXECUTION;
        } else if (!"<function".startsWith(buffer)) {
          // Deno.stdout.writeSync(encoder.encode(buffer));
          buffer = "";
          state = State.TEXT;
        }
        break;

      case State.FUNCTION_TAG_EXECUTION:
        buffer += char;
        if (char === ">") {
          // Extract command from attributes (e.g., <function cmd="espeak-ng -v en">)
          const attrStr = buffer.match(/\b((\w+)\s*=\s*"([^"]+?)")/g);
          const attrs = attrStr?.reduce((acc: { [key: string]: string }, attr) => {
            const [key, value] = attr.split("=");
            acc[key] = value.replace(/"/g, "");
            return acc;
          }, {});

          // console.log({ attrs });

          if (attrs?.cmd) {
            const commandArgs = parse(attrs.cmd);

            // Start the command process
            try {
              const command = new Command(commandArgs[0], {
                args: commandArgs.slice(1),
                stdin: "piped",
                // stdout: "inherit",
                // stderr: "inherit",
              });

              Deno.writeTextFileSync("execution.log", JSON.stringify(commandArgs) + "\n", { append: true });

              console.log(`${Deno.cwd()}$ ${attrs.cmd}`)

              commandProcess = command.spawn();

              commandWriter = commandProcess.stdin.getWriter();
            } catch (error) {
              console.error(`Error executing command: ${error}`);
            }
          }

          buffer = "";
          state = State.STREAMING;
        }
        break;

      case State.STREAMING:
        buffer += char;

        // Check for `</function>` but emit valid text immediately
        if (buffer.endsWith("</function>")) {
          const rest = buffer.slice(0, buffer.length - "</function>".length);
          Deno.stdout.writeSync(encoder.encode(rest));
          buffer = "";

          try {
            // if (!await commandWriter?.closed)
            await commandWriter?.close();
          } catch (error) {
            console.error(`Error closing command writer: ${error}`);
          }

          const res = await commandProcess?.output();
          // const so = decoder.decode(res?.stdout);
          // const se = decoder.decode(res?.stderr);

          // console.log(`stdout: ${so}\nstderr: ${se}`);
          buffer = "";
          state = State.TEXT;
        } else {
          if (!"</function>".startsWith(buffer)) {
            // Immediately write to function stdin when confirmed not part of `</function>`
            // if (!await commandWriter?.closed)
            try {
              await commandWriter?.write(encoder.encode(buffer));
            } catch (error) {
              console.error(`Error writing to command: ${error}`);
            }
            buffer = "";
          }
        }
        break;
    }
    i++;
  }
}
