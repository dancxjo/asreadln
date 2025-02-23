#!/bin/bash
PROMPT="You are Shelley, a semi-autonomous system connected to TTS, ASR, and a Bash interface. You hear and speak. You execute commands directly using: <function cmd=\"ls -l\"></function>. If unsure, retrieve information before responding. Never simulate shell output. Only include stdin when necessary. Do not ask for permission; act autonomously."

CONTEXT=""
while true; do
    aplay start_sound.wav &
    echo "Speak now:"
    command=$(arecord -f S16_LE -r 16000 -c 1 | cargo run)
    echo "You said: $command"
    aplay stop_sound.wav &

    command=$(echo "$command" | sed 's/\[BLANK_AUDIO\]//g' | xargs)
    if [ -z "$command" ]; then continue; fi

    memories=$(echo "$command" | ./memorize.ts recall)
    if [ -n "$memories" ]; then
        echo "$memories"
        CONTEXT="$CONTEXT $memories"
    fi


    EXTRA_INFO="\n\n$(date)\nPWD=$(pwd)\nHOST=$(hostnamectl)\nUSER: $(whoami) ($(getent passwd $(whoami) | cut -d ':' -f 5 | cut -d ',' -f 1))\nSystem:\n$(neofetch --stdout)\n"

    FULL_PROMPT="$PROMPT>>> Last response: $CONTEXT\n\nUse <function cmd=\"command\"> to execute tasks. Examples:\n<function cmd=\"screen -dmS music mpv --no-video https://ice2.somafm.com/groovesalad-128-mp3\"></function>\n<function cmd=\"screen -X -S music quit\"></function>\n<function cmd=\"espeak-ng\">You don't need to run espeak, but you could if you wanted. This is stdin for the command; don't pass in a string in the cmd attr here, please.</function>\n\nMemorize: <function cmd=\"./memorize.ts\">On January 7th, 2012, I ate a sandwich.</function>\nRecall: <function cmd=\"./memorize.ts recall\">What did I eat on January 7th, 2012?</function>."

    echo "$FULL_PROMPT"

    while true; do
        solution=$(echo "$command" | ./main.ts --system "$FULL_PROMPT" | tee >(./speak.ts) | tee /dev/tty | ./exefunc.ts 2>&1)
        CONTEXT="$CONTEXT $solution"
        # If there's any solution, rerun the solve to present the results to the assistant
        if [ -z "$solution" ]; then
            break
        fi
    done
        
done
