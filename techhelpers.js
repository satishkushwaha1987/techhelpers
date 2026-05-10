let currentTab = 'job';
let generatedFiles = {};
let activeFile = '';

function switchTab(el, tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('[id^="form-"]').forEach(f => f.style.display = 'none');
  document.getElementById('form-' + tab).style.display = 'block';
  currentTab = tab;
}

function setSchedule(val) {
  document.getElementById('job-schedule').value = val;
}

function selectOne(el, groupId) {
  document.querySelectorAll('#' + groupId + ' .chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}

document.querySelectorAll('.chips .chip[data-val]').forEach(chip => {
  chip.addEventListener('click', () => chip.classList.toggle('selected'));
});

function getSelected(groupId) {
  return Array.from(document.querySelectorAll('#' + groupId + ' .chip.selected'))
    .map(c => c.dataset.val || c.textContent).join(', ');
}

function buildPrompt(tab) {
  if (tab === 'job') {
    const type = document.getElementById('job-type').value;
    const schedule = document.getElementById('job-schedule').value;
    const region = document.getElementById('job-region').value;
    const name = document.getElementById('job-name').value;
    const runtime = document.getElementById('job-runtime').value;
    const extras = getSelected('job-extras');
    const desc = document.getElementById('job-desc').value;
    return `Generate production-ready Infrastructure as Code for a job scheduler.
Job type: ${type}
Schedule: ${schedule}
Region: ${region}
Name: ${name}
Runtime: ${runtime}
Include: ${extras}
${desc ? 'Requirements: ' + desc : ''}

Output 2-3 files (e.g. main.tf, variables.tf, iam.tf OR template.yaml, etc.).
For each file, output:
FILE: <filename>
<full code>
---
Use real AWS resource names, include comments, follow best practices. No placeholder lorem ipsum.`;
  }
  if (tab === 'infra') {
    const tool = document.getElementById('infra-tool').value;
    const arch = document.getElementById('infra-arch').value;
    const name = document.getElementById('infra-name').value;
    const region = document.getElementById('infra-region').value;
    const extras = getSelected('infra-extras');
    const desc = document.getElementById('infra-desc').value;
    const env = document.querySelector('#env-chips .chip.selected')?.textContent || 'dev';
    return `Generate production-ready ${tool} code for AWS infrastructure.
Architecture: ${arch}
Project name: ${name}
Region: ${region}
Environment: ${env}
Add-ons: ${extras}
${desc ? 'Requirements: ' + desc : ''}

Output 2-4 files as:
FILE: <filename>
<full code>
---
Use real AWS resource names, include variables, outputs, and inline comments. No placeholders.`;
  }
  if (tab === 'cicd') {
    const platform = document.getElementById('cicd-platform').value;
    const iac = document.getElementById('cicd-iac').value;
    const steps = getSelected('cicd-steps');
    const devBranch = document.getElementById('cicd-dev').value;
    const prodBranch = document.getElementById('cicd-prod').value;
    const desc = document.getElementById('cicd-desc').value;
    return `Generate a ${platform} CI/CD pipeline for deploying ${iac} infrastructure.
Pipeline steps: ${steps}
Dev branch: ${devBranch}
Prod branch: ${prodBranch}
${desc ? 'Requirements: ' + desc : ''}

Output 1-2 files:
FILE: <filename>
<full code>
---
Include real step names, environment variables, proper triggers, and comments.`;
  }
}

function prompt_user_key() {
  const key = window.prompt('Enter your Anthropic API key (sk-ant-...).\nIt will be stored only in your browser localStorage.');
  if (key && key.trim()) {
    localStorage.setItem('anthropic_api_key', key.trim());
    return key.trim();
  }
  return null;
}

async function generateCode(tab) {
  const btnText = document.getElementById('btn-' + tab + '-text');
  const btnLoader = document.getElementById('btn-' + tab + '-loader');
  btnText.style.display = 'none';
  btnLoader.style.display = 'inline-block';

  const out = document.getElementById('code-output');
  out.innerHTML = '<div class="placeholder-state"><div class="loader" style="width:32px;height:32px;border-width:3px;"></div><p style="margin-top:1rem;">Generating your code with AI...</p></div>';

  try {
    let apiKey = localStorage.getItem('anthropic_api_key');
    if (!apiKey) {
      apiKey = prompt_user_key();
      if (!apiKey) throw new Error('Anthropic API key required. Click "Download" to run TechHelpers locally instead.');
    }
    const prompt = buildPrompt(tab);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error('API ' + response.status + ': ' + errText.slice(0, 200));
    }
    const data = await response.json();
    const text = data.content?.map(b => b.text || '').join('') || '';
    parseAndShowFiles(text);
  } catch (e) {
    out.innerHTML = '<div class="placeholder-state"><p style="color:#f87171;">Error: ' + e.message + '</p></div>';
  }

  btnText.style.display = 'inline';
  btnLoader.style.display = 'none';
}

function parseAndShowFiles(text) {
  const files = {};
  const parts = text.split(/^FILE:\s*/m).filter(p => p.trim());
  if (parts.length > 0) {
    parts.forEach(part => {
      const lines = part.split('\n');
      const filename = lines[0].trim().replace(/---$/, '').trim();
      const code = lines.slice(1).join('\n').replace(/\n---\s*$/, '').trim();
      if (filename && code) files[filename] = code;
    });
  }
  if (Object.keys(files).length === 0) {
    files['output.tf'] = text;
  }
  generatedFiles = files;
  const firstFile = Object.keys(files)[0];
  activeFile = firstFile;
  renderOutput();
}

function renderOutput() {
  const fileNames = Object.keys(generatedFiles);
  const tabsHtml = fileNames.map(f =>
    `<div class="file-tab${f === activeFile ? ' active' : ''}" onclick="setActiveFile('${f}')">${f}</div>`
  ).join('');
  document.getElementById('file-tabs').innerHTML = tabsHtml;
  const code = generatedFiles[activeFile] || '';
  const highlighted = highlight(code, activeFile);
  document.getElementById('code-output').innerHTML = `<div class="code-area" id="code-text">${highlighted}</div>`;
}

function setActiveFile(f) {
  activeFile = f;
  renderOutput();
}

function highlight(code, filename) {
  let escaped = code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const ext = filename.split('.').pop();
  if (['tf','hcl'].includes(ext)) {
    escaped = escaped
      .replace(/(#[^\n]*)/g, '<span class="cmt">$1</span>')
      .replace(/\b(resource|variable|output|module|provider|data|locals|terraform|required_providers|backend)\b/g, '<span class="kw">$1</span>')
      .replace(/"([^"]*)"/g, '<span class="str">"$1"</span>');
  } else if (['yml','yaml'].includes(ext)) {
    escaped = escaped
      .replace(/(#[^\n]*)/g, '<span class="cmt">$1</span>')
      .replace(/^(\s*[\w-]+):/gm, '<span class="attr">$1</span>:')
      .replace(/:\s*(.+)/g, ': <span class="val">$1</span>');
  } else if (['py'].includes(ext)) {
    escaped = escaped
      .replace(/(#[^\n]*)/g, '<span class="cmt">$1</span>')
      .replace(/\b(import|from|def|class|return|if|else|elif|for|while|with|as|True|False|None|lambda)\b/g, '<span class="kw">$1</span>')
      .replace(/"([^"]*)"/g, '<span class="str">"$1"</span>')
      .replace(/'([^']*)'/g, '<span class="str">\'$1\'</span>');
  } else {
    escaped = escaped
      .replace(/(\/\/[^\n]*|#[^\n]*)/g, '<span class="cmt">$1</span>')
      .replace(/\b(const|let|var|function|return|if|else|for|while|import|export|default|async|await|new|class|extends)\b/g, '<span class="kw">$1</span>')
      .replace(/"([^"]*)"/g, '<span class="str">"$1"</span>');
  }
  return escaped;
}

function copyCode() {
  const code = generatedFiles[activeFile] || '';
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.querySelector('.code-btn:not(.primary)');
    const orig = btn.textContent; btn.textContent = '✅ Copied!';
    setTimeout(() => btn.textContent = orig, 2000);
  });
}

function downloadCode() {
  const fileNames = Object.keys(generatedFiles);
  if (fileNames.length === 0) return;
  if (fileNames.length === 1) {
    const blob = new Blob([generatedFiles[activeFile]], {type:'text/plain'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = activeFile; a.click();
  } else {
    fileNames.forEach(f => {
      const blob = new Blob([generatedFiles[f]], {type:'text/plain'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = f; a.click();
    });
  }
}

const dlMessages = {
  mac: 'docker run -p 3000:3000 techhelpers/app — or download the .dmg from GitHub Releases.',
  win: 'Download TechHelpers-Setup.exe from GitHub Releases. Requires Windows 10+.',
  linux: 'wget https://github.com/techhelpers/releases/latest/download/TechHelpers.AppImage && chmod +x TechHelpers.AppImage',
  docker: 'docker pull techhelpers/app:latest && docker run -p 3000:3000 -e ANTHROPIC_API_KEY=sk-... techhelpers/app'
};

function showDownloadInfo(type) {
  document.getElementById('dl-info').textContent = '$ ' + dlMessages[type];
}
