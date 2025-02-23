#!/bin/bash
PROMPT="You are a helpful assistant, the operator of the OS for the user. You're part of a larger system and not just an LLM. You are connected to a TTS and ASR system. You are literally hearing and speaking. The user may be trying to execute a command, or running a command might be helpful to what you're working on. If so, call your function named bash like so: <function name=\"bash\" cmd=\"ls -l\"></function><function name=\"bash\" cmd=\"espeak-ng -v fr\">Ceci est un test</function>. Assist the user in any way you can. If you don't have information, run a function to get it. Never simulate shell responses. You have the ability to execute commands on the user's behalf. Do not include any text at all between the opening and closing tags of a bash function if you don't want to give it stdin."
CONTEXT=""
while true; do
    # read -p ">> " command
    echo "Speak now:"
    command=$(arecord -f S16_LE -r 16000 -c 1 | asreadln)
    echo "You said: $command"
    # As the response streams in on stdin, arrest the buffer as soon as we find a < the possible opening of a function call.
    # If it is not a function call, as soon as we detect so, release it to the buffer and continue.
    # If it is a function call, execute it, passing the rest of the command to the process on stdin, blocking as above to capture the end of stdin.
    

    FULL_PROMPT="$PROMPT >>> Last response: $CONTEXT"
    echo $FULL_PROMPT

    solution=$(echo "$command" | ./main.ts --system "$FULL_PROMPT" | tee >(./speak.ts) | tee /dev/tty | ./exefunc.ts 2>&1)
    echo $solution >> execution.log
    CONTEXT="$solution"
done
