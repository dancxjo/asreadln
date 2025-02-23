#!/usr/bin/env -S deno run -A

import { Ollama } from 'npm:ollama';
import { QdrantClient } from 'npm:@qdrant/js-client-rest';
import { Command } from "https://deno.land/x/cliffy@v0.20.1/command/mod.ts";
import { split } from "npm:sentence-splitter";
import { v4 as uuidv4 } from "npm:uuid";

const cmd = new Command()
    .name("memorize.ts")
    .version("1.2.0")
    .description("Memorize input text into the Qdrant database and perform nearest neighbor searches.")
    .option("-o, --ollama-host <host>", "Ollama server host", { default: "http://forebrain.local:11434" })
    .option("-m, --model <model>", "Ollama model name", { default: "nomic-embed-text" })
    .option("-q, --qdrant-url <url>", "Qdrant server URL", { default: "http://localhost:6333" })
    .option("-c, --collection <name>", "Qdrant collection name", { default: "memorized_text" })
    .arguments("[filename]")
    .action(async (options, filename) => {
        const inputText = await getInputText(filename);
        await memorize(inputText, options);
    })
    .command("recall")
    .description("Perform a nearest neighbor search using input text")
    .option("-o, --ollama-host <host>", "Ollama server host", { default: "http://forebrain.local:11434" })
    .option("-m, --model <model>", "Ollama model name", { default: "nomic-embed-text" })
    .option("-q, --qdrant-url <url>", "Qdrant server URL", { default: "http://localhost:6333" })
    .option("-c, --collection <name>", "Qdrant collection name", { default: "memorized_text" })
    .arguments("[filename]")
    .action(async (options, filename) => {
        const inputText = await getInputText(filename);
        await recall(inputText.trim(), options);
    })
    .command("start-qdrant")
    .description("Start a Qdrant server in Docker with a persistent volume")
    .action(async () => {
        const command = new Deno.Command("docker", {
            args: [
                "run", "-d",
                "--name", "qdrant_server",
                "-p", "6333:6333",
                "-v", "qdrant_data:/qdrant/storage",
                "qdrant/qdrant"
            ],
            stdout: "inherit",
            stderr: "inherit",
        });
        const { code } = await command.output();
        if (code === 0) {
            console.log("Qdrant server started successfully.");
        } else {
            console.error("Failed to start Qdrant server.");
        }
    });;

await cmd.parse(Deno.args);

async function getInputText(filename?: string): Promise<string> {
    if (filename) {
        return await Deno.readTextFile(filename);
    }
    const decoder = new TextDecoder();
    const buf = new Uint8Array(1024);
    let input = "";
    let n;
    while ((n = await Deno.stdin.read(buf)) !== null) {
        input += decoder.decode(buf.subarray(0, n));
    }
    return input;
}

async function memorize(text: string, options: Record<string, string>) {
    const ollama = new Ollama({ host: options.ollamaHost });
    const client = new QdrantClient({ url: options.qdrantUrl });
    const collectionName = options.collection;

    const sentences: string[] = split(text.trim()).map((sentence) => sentence.raw);
    // console.warn("📝 Sentences for storage:", sentences);

    try {
        await ollama.pull({ model: options.model });
        const response = await ollama.embed({ model: options.model, input: sentences });
        const embeddings: number[][] = response.embeddings;

        // console.warn("🔢 Generated embeddings:", embeddings);

        await ensureCollectionExists(collectionName, embeddings[0].length, options);

        for (let i = 0; i < sentences.length; i++) {
            const uniqueId = uuidv4(); // Use UUID for unique storage ID
            await storeEmbeddingsInQdrant(client, collectionName, uniqueId, embeddings[i], sentences[i].trim());
            console.log(`✅ Stored: "${sentences[i].trim()}" with ID ${uniqueId}`);
        }
    } catch (error) {
        console.error(`❌ Error processing sentences: ${error}`);
    }
}

async function recall(query: string, options: Record<string, string>) {
    const ollama = new Ollama({ host: options.ollamaHost });
    const client = new QdrantClient({ url: options.qdrantUrl });
    const collectionName = options.collection;

    try {
        console.log(`🔎 Let's see what we can remember about: "${query}"`);

        const response = await ollama.embed({ model: options.model, input: [query] });
        const queryVector: number[] = response.embeddings[0];

        // console.warn("🔢 Query embedding:", queryVector);

        const searchResults = await client.search(collectionName, {
            vector: queryVector,
            limit: 5,  // Ensure we get multiple results
            with_payload: true,
        });

        console.log("🧠 You can remember this:");
        for (const result of searchResults) {
            if (result.payload) {
                console.log(`- ${result.payload.text} (score: ${result.score.toFixed(3)})`);
            } else {
                console.log(`- (score: ${result.score.toFixed(3)})`);
            }
        }
    } catch (error) {
        console.error(`❌ Error during recall: ${error}`);
    }
}

async function ensureCollectionExists(collectionName: string, vectorSize: number, options: Record<string, string>) {
    const client = new QdrantClient({ url: options.qdrantUrl });

    try {
        await client.getCollection(collectionName);
        console.log(`✅ Collection "${collectionName}" already exists.`);
    } catch (error) {
        if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
            console.log(`🛠️ Creating collection "${collectionName}"...`);
            await client.createCollection(collectionName, {
                vectors: { size: vectorSize, distance: "Cosine" },
            });
        } else {
            throw error;
        }
    }
}

async function storeEmbeddingsInQdrant(client: QdrantClient, collectionName: string, id: string, embedding: number[], text: string) {
    // console.warn(`📌 Storing "${text}" with unique ID ${id}`);

    await client.upsert(collectionName, {
        points: [{
            id: id,  // Store as UUID instead of incrementing global index
            vector: embedding,
            payload: { text, created_at: new Date().toISOString() },
        }],
    });
}
