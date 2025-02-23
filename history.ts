import { Message } from "npm:ollama";

export const history: Message[] = [];

// If there is a file ~/.shellm_history, read its contents into history
try {
    const historyFile = Deno.readTextFileSync(Deno.env.get("HOME") + "/.shellm_history");
    history.push(...JSON.parse(historyFile));
} catch (error) {
    console.error(`Error reading history file: ${error}`);
}

export function saveHistory() {
    try {
        Deno.writeTextFileSync(Deno.env.get("HOME") + "/.shellm_history", JSON.stringify(history));
    } catch (error) {
        console.error(`Error writing history file: ${error}`);
    }
}
