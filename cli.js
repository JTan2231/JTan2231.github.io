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
    '<div><a href="https://github.com/jtan2231/tllm">TLLM/</a></div>',
    '<div><a href="https://github.com/jtan2231/dewey">Dewey/</a></div>',
    '<div><a href="https://github.com/jtan2231/scratch">Scratch/</a></div>',
    '<div><a href="https://github.com/jtan2231/bernard">Bernard/</a></div>',
];

// lol
const cdMap = {
    "GitHub": "https://github.com/jtan2231",
    "LinkedIn": "https://www.linkedin.com/in/joseph-tan-478aa5186/",
    "Are.na": "https://www.are.na/joey-tan/channels",
    "Twitter": "https://x.com/joeymtan",
    "Ritual": "https://joeytan.dev/ritual",
    "TLLM": "https://github.com/jtan2231/tllm",
    "Dewey": "https://github.com/jtan2231/dewey",
    "Scratch": "https://github.com/jtan2231/scratch",
    "Bernard": "https://github.com/jtan2231/bernard",
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
    "Ritual": "Journaling + weekly reflection assistant",
    "TLLM": "A terminal chat interface for large language models",
    "Dewey": "An embedding index for local files",
    "Scratch": "A lightweight scratch pad for handwritten notes",
    "Bernard": "A homemade programming assistant"
};

function addDisplayItem(text) {
    const element = document.createElement('div');
    element.innerHTML = text;

    element.style.fontFamily = 'monospace';
    element.style.fontSize = '14px';
    element.style.userSelect = 'none';

    const display = document.getElementById('display');
    display.appendChild(element);
}

function info() {
    const text = `
<div>I'm Joey, a software developer currently interested in AI and its surrounding infrastructure.</div>
<br/>
<div>You can find me on</div>
${socials.join('\n')}
<br/>
# Projects
${Object.entries(projectInfo).map(([project, description]) => `<div><a href="${cdMap[project]}">${project}/</a> - ${description}</div>`).join('\n')}
<br/>
<div>Use command \`help\` for more info</div>
<br/>`;

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
                    const lines = data.split('\n');
                    addDisplayItem('<br/>');
                    lines.forEach(line => addDisplayItem(`<div>${line.length ? line : space}</div>`));
                    addDisplayItem('<br/>');
                })
                .catch(error => {
                    addDisplayItem(`Error fetching contents of ${dir}: ${error}`);
                });
        } else {
            addDisplayItem(`ls: ${dir}: No such directory`);
        }
    } else {
        addDisplayItem(`<div style="display: flex;">${socials.join(space)}${space}${projects.join(space)}</div>`);
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
