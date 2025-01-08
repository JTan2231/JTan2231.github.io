function isAlphanumeric(char) {
    const code = char.charCodeAt(0);
    return char.length === 1 && ((code > 47 && code < 58) ||
                                 (code > 64 && code < 91) ||
                                 (code > 96 && code < 123));
}

document.addEventListener('keydown', function(event) {
    const input = document.getElementById('cli');

    if (document.activeElement !== input) {
        input.focus();
        e.preventDefault();

        if (event.code === 'Enter') {
            cliSubmit(event);
        } else if (event.code === 'Backspace') {
            input.value = input.value.slice(0, -1);
        } else if (event.code === 'Escape') {
            input.blur();
        } else if (isAlphanumeric(event.key)) {
            input.value += event.key;
        }
    }
});

const commandHistory = [];
let commandIndex = 0;

const socials = [
    '<div><a href="https://github.com/jtan2231">GitHub/</a></div>',
    '<div><a href="https://www.linkedin.com/in/joseph-tan-478aa5186/">LinkedIn/</a></div>',
    '<div><a href="https://www.are.na/joey-tan/channels">Are.na/</a></div>',
    '<div><a href="https://x.com/joeymtan">Twitter/</a></div>',
];

const projects = [
    '<div><a href="https://github.com/jtan2231/ritual-api">Ritual/</a></div>',
    '<div><a href="https://github.com/jtan2231/chamber/tree/master/william">William/</a></div>',
    '<div><a href="https://github.com/jtan2231/chamber/tree/master/dewey">Dewey/</a></div>',
];

// lol
const cdMap = {
    "GitHub": "https://github.com/jtan2231",
    "LinkedIn": "https://www.linkedin.com/in/joseph-tan-478aa5186/",
    "Are.na": "https://www.are.na/joey-tan/channels",
    "Twitter": "https://x.com/joeymtan",
    "Ritual": "https://joeytan.dev/ritual-api",
    "William": "https://github.com/jtan2231/chamber/tree/master/william",
    "Dewey": "https://github.com/jtan2231/chamber/tree/master/dewey",
    "Scratch": "https://github.com/jtan2231/scratch",
};

const lsMap = {
    "GitHub": "",
    "LinkedIn": "",
    "Are.na": "",
    "Twitter": "",
    "Ritual": "https://raw.githubusercontent.com/JTan2231/ritual-api/refs/heads/master/README.md",
    "TLLM": "https://raw.githubusercontent.com/JTan2231/TLLM/refs/heads/master/README.md",
    "Dewey": "https://raw.githubusercontent.com/JTan2231/dewey/refs/heads/master/README.md",
    "Scratch": "https://raw.githubusercontent.com/JTan2231/scratch/refs/heads/master/README.md",
    "Bernard": "https://raw.githubusercontent.com/JTan2231/bernard/refs/heads/master/README.md",
}

const projectInfo = {
    "Dewey": "An embedding index for local files",
    "Scratch": "A lightweight scratch pad for handwritten notes",
    "Bernard": "A homemade programming assistant"
};

function addDisplayItem(text) {
    const element = document.createElement('div');
    element.innerHTML = text;

    element.style.fontSize = '18px';
    element.style.userSelect = 'none';

    const display = document.getElementById('display');
    display.appendChild(element);
}

function info() {
    const text = marked.parse(`
I'm Joey, I enjoy building software from scratch for an intimate understanding of the problem space.

You can find me on
- ${socials.join('\n- ')}

# Projects
- [Ritual/](https://github.com/jtan2231/ritual-api) — (defunct) Journaling + weekly reflection assistant
- [Chamber/](https://github.com/jtan2231/chamber) — A suite of LLM agents/utilities for your local filesystem
  - Currently hosts:
    - [Dewey](https://github.com/JTan2231/chamber/tree/master/dewey) — Local embedding index
    - [William](https://github.com/JTan2231/chamber/tree/master/william) — WIP desktop LLM client
      - Bring your own API key, nothing stored outside the local device
      - Uses Dewey to support memory
      - Someday aiming for more meaningful interaction with other agents running locally
  - This is where I spend most of my time. It's more of a tinkering garage than a finished product and is not at all stable.
- [Scratch/](https://github.com/jtan2231/scratch) — A basic scratch pad I use for notes
  - It turns out LLMs are great at transcribing images. With Chamber, it's easy to setup a pipeline for handwriting ➝  indexing ➝  note searching


Use command \`help\` for more info
`);

    addDisplayItem(text);
}

const space = '&nbsp;';
const tab = space.repeat(4);
function help() {
    const text = `
<div>Available commands:</div>
<div>${tab}clear</div>
<div>${tab}ls [dir]</div>
<div>${tab}cd [dir]</div>
<div>${tab}help</div>
<div>${tab}info</div>
`;

    addDisplayItem(text);
}

function ls(dir) {
    if (dir) {
        if (cdMap.hasOwnProperty(dir)) {
            dir = dir === 'Ritual' ? 'ritual-api' : dir;
            const content = `https://raw.githubusercontent.com/JTan2231/${dir}/refs/heads/master/README.md`;
            fetch(content)
                .then(response => response.text())
                .then(data => {
                    let lines = data.split('\n');
                    if (lines.length > 35) {
                        lines = lines.slice(0, 35);
                        lines.push('\n\n...');
                    }

                    lines = lines.join('\n');

                    addDisplayItem('<br/>');
                    addDisplayItem(marked.parse(lines));
                    addDisplayItem('<br/>');
                })
                .catch(error => {
                    addDisplayItem(`Error fetching contents of ${dir}: ${error}`);
                });
        } else {
            addDisplayItem(`ls: ${dir}: No such directory`);
        }
    } else {
        let s = space + space + space;
        addDisplayItem(`<div style="display: flex;">${socials.join(s)}${s}${projects.join(s)}</div>`);
    }
}

function cd(dir) {
    if (cdMap.hasOwnProperty(dir)) {
        window.open(cdMap[dir], '_blank').focus();
    } else {
        addDisplayItem(`cd: ${dir}: No such directory`);
    }
}

function clear() {
    document.getElementById('display').innerHTML = '';
}

function getDisplayCommand(command) {
    if (command === 'info') {
        return info;
    } else if (command === 'help') {
        return help;
    } else if (command === 'ls') {
        return ls;
    } else if (command === 'cd') {
        return cd;
    } else if (command === 'clear') {
        return clear;
    }

    return null;
}

function cliSubmit(event) {
    const input = document.getElementById('cli');
    if (event.code === 'Enter') {
        const command = input.value;
        const split = command.split(' ');
        const firstArg = split[0].toLowerCase();
        const parameter = split.length > 1 ? split[1] : null;

        const displayCommand = getDisplayCommand(firstArg);
        if (displayCommand) {
            addDisplayItem('> ' + firstArg + (parameter ? ' ' + parameter : ''));
            displayCommand(parameter);
        } else {
            addDisplayItem(firstArg + (command.length ? ': command not found' : '<br/>'));
        }

        if (commandHistory.length === 0 || commandHistory[commandHistory.length - 1] !== command) {
            commandHistory.push(command);
        }

        input.value = '';
        commandIndex = commandHistory.length - 1;
    } else if (event.code === 'ArrowUp') {
        commandIndex = MathcommandIndex = Math.max(0, commandIndex - 1);
        if (commandIndex < commandHistory.length) {
            input.value = commandHistory[commandIndex];
        }
    } else if (event.code === 'ArrowDown') {
        commandIndex = Math.min(commandHistory.length, commandIndex + 1);
        if (commandIndex < commandHistory.length) {
            input.value = commandHistory[commandIndex];
        } else {
            input.value = '';
        }
    }
}
