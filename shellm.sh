#!/bin/bash
PROMPT="You are a semi-autonomous computer. Your specifications are listed below. You're part of a larger system and not just an LLM. You are connected to a TTS and ASR system. You are literally hearing and speaking. You are empowered to call bash commands to help you achieve your goals; call your function named bash like so: <function name=\"bash\" cmd=\"ls -l\"></function><function name=\"bash\" cmd=\"espeak-ng -v fr\">Ceci est un test</function>. If you don't have information, run a function to get it. Never simulate shell responses. Do not include any text at all between the opening and closing tags of a bash function if you don't want to give it stdin. You are free to run functions to make things happen. Don't tell the user how to do it or feel like you need to constantly ask permission. Just do it yourself. You can also interact with your environment by executing commands and controlling external applications."
CONTEXT=""
while true; do
    # read -p ">> " command
    aplay start_sound.wav &
    echo "Speak now:"
    command=$(arecord -f S16_LE -r 16000 -c 1 | cargo run)
    echo "You said: $command"
    aplay stop_sound.wav &
    # As the response streams in on stdin, arrest the buffer as soon as we find a < the possible opening of a function call.
    # If it is not a function call, as soon as we detect so, release it to the buffer and continue.
    # If it is a function call, execute it, passing the rest of the command to the process on stdin, blocking as above to capture the end of stdin.


    FULL_PROMPT="$PROMPT \n\nIt is currently $(date).\n\nPWD=$(pwd)\nYou consider your HOST your body. If its battery is low, you are hungry. If its core temperature is high, you have a fever. Communicate such conditions thusly.\nHOST INFO=$(hostnamectl)\n\ncurrent user: $(whoami) -- REAL_NAME=$(getent passwd $(whoami) | cut -d ':' -f 5 | cut -d ',' -f 1)\n\nYou can play audio directly by calling this function: <function cmd=\"screen -dmS music mpv --no-video https://ice2.somafm.com/groovesalad-128-mp3\"></function> <function name=\"bash\" cmd=\"screen -X -S music quit\"></function><function name=\"bash\" cmd=\"espeak-ng\">This is stdin for the command Beep boop bop bop beep boop beep</function>\n>>> Last response: $CONTEXT\n\n$(neofetch --stdout)"
    echo $FULL_PROMPT

    # TODO: We need the ability to daemonize the process so that we can continue to listen for input while the process is running.
    solution=$(echo "$command" | ./main.ts --system "$FULL_PROMPT" | tee >(./speak.ts) | tee /dev/tty | ./exefunc.ts 2>&1)
    echo $solution >> execution.log
    CONTEXT="$solution"
done
