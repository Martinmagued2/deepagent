/* NexusAI Studio IDE — Full Desktop Developer Experience */
/* eslint-disable */

var useState = React.useState;
var useEffect = React.useEffect;
var useRef = React.useRef;
var useCallback = React.useCallback;

// ============================================================
// HELPERS
// ============================================================
function getLanguageFromExt(filepath) {
  if (!filepath) return 'plaintext';
  var ext = filepath.split('.').pop().toLowerCase();
  switch (ext) {
    case 'js': case 'jsx': return 'javascript';
    case 'ts': case 'tsx': return 'typescript';
    case 'html': return 'html';
    case 'css': return 'css';
    case 'json': return 'json';
    case 'py': return 'python';
    case 'md': return 'markdown';
    case 'sh': return 'shell';
    case 'yml': case 'yaml': return 'yaml';
    case 'xml': return 'xml';
    case 'sql': return 'sql';
    default: return 'plaintext';
  }
}

function getFileIcon(name, isDir) {
  if (isDir) return '📁';
  var ext = name.split('.').pop().toLowerCase();
  switch (ext) {
    case 'js': case 'jsx': return '🟨';
    case 'ts': case 'tsx': return '🔷';
    case 'html': return '🌐';
    case 'css': return '🎨';
    case 'json': return '📋';
    case 'py': return '🐍';
    case 'md': return '📝';
    case 'png': case 'jpg': case 'gif': case 'svg': return '🖼️';
    default: return '📄';
  }
}

function formatTime(ts) {
  if (!ts) return '';
  var d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function truncate(s, n) { return s && s.length > n ? s.substring(0, n) + '…' : s; }

// ============================================================
// MAIN APP
// ============================================================
function NexusStudioApp() {
  // Navigation
  var [activeView, setActiveView] = useState('explorer');
  var [bottomTab, setBottomTab] = useState('terminal');
  var [showPreview, setShowPreview] = useState(true);
  var [showAgentPanel, setShowAgentPanel] = useState(true);  // toggleable agent panel
  var [showBottomPanel, setShowBottomPanel] = useState(true);  // toggleable bottom panel
  var [showSidebar, setShowSidebar] = useState(true);  // toggleable sidebar
  var [showNewProjectModal, setShowNewProjectModal] = useState(false);
  var [showSettingsModal, setShowSettingsModal] = useState(false);
  var [showOnboarding, setShowOnboarding] = useState(false);
  var [approvalRequest, setApprovalRequest] = useState(null);
  var [diffViewer, setDiffViewer] = useState(null);

  // Resizable panel dimensions
  var [sidebarWidth, setSidebarWidth] = useState(240);
  var [agentPanelWidth, setAgentPanelWidth] = useState(380);
  var [bottomPanelHeight, setBottomPanelHeight] = useState(220);
  var [previewWidth, setPreviewWidth] = useState(0.5);  // fraction 0..1 of editor row

  // Drag state for resizers
  var [drag, setDrag] = useState(null);  // null | { type: 'sidebar'|'agent'|'bottom'|'preview', startX, startY, startVal }

  // Project & Workspace
  var [activeProject, setActiveProject] = useState({ path: '', name: 'Loading...', recent: [] });
  var [fileTree, setFileTree] = useState([]);
  var [openTabs, setOpenTabs] = useState([]);
  var [activeTabPath, setActiveTabPath] = useState(null);
  var [contextMenu, setContextMenu] = useState(null);

  // Agent
  var [agentPrompt, setAgentPrompt] = useState('');
  var [agentRunning, setAgentRunning] = useState(false);
  var [agentEvents, setAgentEvents] = useState([]);
  var [currentPlan, setCurrentPlan] = useState('');
  var [analysisText, setAnalysisText] = useState('');
  var [reasoningText, setReasoningText] = useState('');

  // Terminal
  var [terminalInput, setTerminalInput] = useState('');
  var [terminalLogs, setTerminalLogs] = useState([]);

  // Problems / Output
  var [problems, setProblems] = useState([]);
  var [outputLogs, setOutputLogs] = useState([]);

  // Git
  var [gitStatus, setGitStatus] = useState({ is_repo: false, branch: '', changes: [], staged: [], unstaged: [], untracked: [], ahead: 0, behind: 0 });
  var [commitMsg, setCommitMsg] = useState('');
  var [gitLog, setGitLog] = useState([]);

  // Experiences
  var [experiences, setExperiences] = useState([]);
  var [expSearch, setExpSearch] = useState('');

  // Search in Workspace
  var [searchQuery, setSearchQuery] = useState('');
  var [searchResults, setSearchResults] = useState([]);

  // Settings
  var [settings, setSettings] = useState({
    general: { theme: 'dark-nexus', default_project_dir: '', startup_behavior: 'restore_last', language: 'en' },
    ai: { provider_type: 'cloud', provider_name: 'OpenRouter', base_url: 'https://openrouter.ai/api/v1', api_key: '', has_api_key: false, model: 'google/gemini-2.0-flash-exp:free', temperature: 0.0, max_tokens: 4096, timeout: 60 },
    agent: { max_repair_attempts: 3, auto_run_commands: false, require_approval: true, browser_testing: true, build_automatically: true, repair_automatically: true },
    security: { allowed_workspace_only: true, allow_terminal: true },
    network: { endpoint: 'https://network.nexusai.dev', agent_identity: 'local-agent', auto_share_experiences: false, auto_retrieve_experiences: true },
    about: { version: '0.2.0', build: 'nexus-studio-desktop' },
  });
  var [testResult, setTestResult] = useState(null);
  var [presets, setPresets] = useState({});

  // Dev server state
  var [devServer, setDevServer] = useState({ running: false, port: null, url: '' });

  // Monaco Editor refs
  var editorContainerRef = useRef(null);
  var monacoEditorInstance = useRef(null);
  var previewIframeRef = useRef(null);
  var terminalEndRef = useRef(null);
  var agentTimelineRef = useRef(null);

  // ============================================================
  // INITIALIZATION & WEBSOCKET
  // ============================================================
  useEffect(function() {
    loadActiveProject();
    loadSettings();
    loadGitStatus();
    loadExperiences();
    loadPresets();
    checkDevServer();

    // Check onboarding
    var onboarded = localStorage.getItem('nexus_onboarded');
    if (!onboarded) {
      setShowOnboarding(true);
    }

    // WebSocket Stream
    var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    var wsUrl = protocol + '//' + window.location.host + '/ws/logs';
    var socket = new WebSocket(wsUrl);

    socket.onmessage = function(event) {
      try {
        var payload = JSON.parse(event.data);
        handleWsEvent(payload);
      } catch (e) {
        console.error('WS parse error:', e);
      }
    };

    socket.onclose = function() {
      console.warn('WebSocket closed — attempting reconnect in 3s');
      setTimeout(function() { location.reload(); }, 3000);
    };

    // Keyboard shortcuts
    function handleKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveCurrentFile();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        setShowNewProjectModal(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setShowSettingsModal(true);
      }
    }
    window.addEventListener('keydown', handleKey);

    return function() {
      socket.close();
      window.removeEventListener('keydown', handleKey);
    };
  }, []);

  // Auto-scroll terminal
  useEffect(function() {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalLogs]);

  // Auto-scroll agent timeline to bottom when new events arrive
  useEffect(function() {
    if (agentTimelineRef.current) {
      agentTimelineRef.current.scrollTop = agentTimelineRef.current.scrollHeight;
    }
  }, [agentEvents]);

  // ============================================================
  // RESIZING — global mouse handlers while dragging a splitter
  // ============================================================
  useEffect(function() {
    if (!drag) return;

    function onMouseMove(e) {
      if (!drag) return;
      var dx = e.clientX - drag.startX;
      var dy = e.clientY - drag.startY;

      if (drag.type === 'sidebar') {
        // Moving right increases sidebar width
        var newW = drag.startVal + dx;
        setSidebarWidth(Math.max(160, Math.min(500, newW)));
      } else if (drag.type === 'agent') {
        // Moving left (negative dx) increases agent panel width
        var newAW = drag.startVal - dx;
        setAgentPanelWidth(Math.max(240, Math.min(600, newAW)));
      } else if (drag.type === 'bottom') {
        // Moving down increases bottom panel height
        var newBH = drag.startVal + dy;
        setBottomPanelHeight(Math.max(80, Math.min(600, newBH)));
      } else if (drag.type === 'preview') {
        // Horizontal drag adjusts preview fraction (0.15..0.85)
        var editorRow = document.querySelector('.editor-workspace-view');
        if (editorRow) {
          var totalW = editorRow.getBoundingClientRect().width;
          if (totalW > 0) {
            var newFrac = drag.startVal + (dx / totalW);
            setPreviewWidth(Math.max(0.15, Math.min(0.85, newFrac)));
          }
        }
      }
    }

    function onMouseUp() {
      setDrag(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = drag.type === 'bottom' ? 'ns-resize' : 'col-resize';
    document.body.style.userSelect = 'none';

    return function() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [drag]);

  function startDrag(type, e) {
    e.preventDefault();
    var startVal;
    if (type === 'sidebar') startVal = sidebarWidth;
    else if (type === 'agent') startVal = agentPanelWidth;
    else if (type === 'bottom') startVal = bottomPanelHeight;
    else if (type === 'preview') startVal = previewWidth;
    setDrag({ type: type, startX: e.clientX, startY: e.clientY, startVal: startVal });
  }

  // ============================================================
  // WEBSOCKET EVENT HANDLER
  // ============================================================
  function handleWsEvent(event) {
    if (event.type === 'agent_started') {
      setAgentRunning(true);
      setAgentEvents([{ type: 'start', text: event.text, time: new Date().toLocaleTimeString() }]);
      setProblems([]);
      setReasoningText('');
      addOutputLog(event.text, 'info');
    } else if (event.type === 'agent_step') {
      setAgentEvents(function(p) { return p.concat([{ type: 'step', text: event.text, time: new Date().toLocaleTimeString(), data: event.data }]); });
      addOutputLog(event.text, 'info');
    } else if (event.type === 'agent_reasoning') {
      // Replace the reasoning text (each reasoning message is a complete thought)
      setReasoningText(event.text);
      setAgentEvents(function(p) {
        // If the last event is a reasoning event, update it; otherwise add new
        if (p.length > 0 && p[p.length - 1].type === 'reasoning') {
          var updated = p.slice();
          updated[updated.length - 1] = { type: 'reasoning', text: event.text, time: new Date().toLocaleTimeString() };
          return updated;
        }
        return p.concat([{ type: 'reasoning', text: event.text, time: new Date().toLocaleTimeString() }]);
      });
    } else if (event.type === 'agent_token') {
      // Streaming LLM token — append to the last reasoning event
      setAgentEvents(function(p) {
        if (p.length > 0 && p[p.length - 1].type === 'streaming') {
          var updated = p.slice();
          updated[updated.length - 1] = { type: 'streaming', text: updated[updated.length - 1].text + event.text, time: new Date().toLocaleTimeString() };
          return updated;
        }
        return p.concat([{ type: 'streaming', text: event.text, time: new Date().toLocaleTimeString() }]);
      });
    } else if (event.type === 'node_update') {
      setAgentEvents(function(p) { return p.concat([{ type: 'node', text: event.text, time: new Date().toLocaleTimeString(), data: event.data }]); });
    } else if (event.type === 'agent_error') {
      setAgentEvents(function(p) { return p.concat([{ type: 'error', text: event.text, time: new Date().toLocaleTimeString(), data: event.data, clickable: true }]); });
      addOutputLog('ERROR: ' + event.text, 'error');
    } else if (event.type === 'analysis_ready') {
      setAnalysisText(event.text);
      setAgentEvents(function(p) { return p.concat([{ type: 'analysis', text: event.text, time: new Date().toLocaleTimeString() }]); });
    } else if (event.type === 'plan_ready') {
      setCurrentPlan(event.data.plan || event.text);
      setAgentEvents(function(p) { return p.concat([{ type: 'plan', text: 'Plan Generated', data: event.data, time: new Date().toLocaleTimeString() }]); });
    } else if (event.type === 'file_creating' || event.type === 'file_editing') {
      setAgentEvents(function(p) { return p.concat([{ type: 'file_action', text: event.text, time: new Date().toLocaleTimeString(), data: event.data }]); });
    } else if (event.type === 'file_written' || event.type === 'file_edited' || event.type === 'file_deleted' || event.type === 'file_created' || event.type === 'file_renamed' || event.type === 'file_saved') {
      loadWorkspaceTree();
      loadGitStatus();
      refreshPreview();
      setAgentEvents(function(p) { return p.concat([{ type: 'file', text: event.text, time: new Date().toLocaleTimeString(), data: event.data, clickable: true }]); });
    } else if (event.type === 'command_running') {
      setTerminalLogs(function(p) { return p.concat({ text: '$ ' + event.data.command, type: 'cmd' }); });
      setAgentEvents(function(p) { return p.concat([{ type: 'command', text: event.text, time: new Date().toLocaleTimeString(), data: event.data, clickable: true }]); });
    } else if (event.type === 'command_finished') {
      setTerminalLogs(function(p) { return p.concat({ text: event.data.stdout || event.data.stderr || event.text, type: event.data.code === 0 ? 'success' : 'error' }); });
    } else if (event.type === 'command_denied') {
      setTerminalLogs(function(p) { return p.concat({ text: '[DENIED] ' + event.data.command, type: 'warning' }); });
    } else if (event.type === 'installing') {
      setAgentEvents(function(p) { return p.concat([{ type: 'install', text: event.text, time: new Date().toLocaleTimeString(), data: event.data }]); });
    } else if (event.type === 'building') {
      setAgentEvents(function(p) { return p.concat([{ type: 'building', text: event.text, time: new Date().toLocaleTimeString() }]); });
    } else if (event.type === 'testing') {
      setAgentEvents(function(p) { return p.concat([{ type: 'testing', text: event.text, time: new Date().toLocaleTimeString() }]); });
    } else if (event.type === 'build_result') {
      setAgentEvents(function(p) { return p.concat([{ type: 'build', text: event.text, passed: event.data.passed, time: new Date().toLocaleTimeString(), data: event.data, clickable: true }]); });
      if (!event.data.passed) {
        setProblems(function(p) { return p.concat([{ severity: 'error', message: 'Build failed', source: 'npm run build', detail: event.data.output }]); });
      }
    } else if (event.type === 'test_result') {
      setAgentEvents(function(p) { return p.concat([{ type: 'test', text: event.text, passed: event.data.passed, time: new Date().toLocaleTimeString(), data: event.data }]); });
    } else if (event.type === 'agent_finished') {
      setAgentRunning(false);
      setAgentEvents(function(p) { return p.concat([{ type: 'done', text: event.text, time: new Date().toLocaleTimeString(), data: event.data }]); });
      addOutputLog(event.text, 'success');
    } else if (event.type === 'terminal_output' || event.type === 'terminal_input') {
      setTerminalLogs(function(p) { return p.concat({ text: event.text, type: 'normal' }); });
    } else if (event.type === 'approval_requested') {
      setApprovalRequest(event.data);
    } else if (event.type === 'approval_responded') {
      setApprovalRequest(null);
    } else if (event.type === 'dev_server_started') {
      setDevServer({ running: true, port: event.data.port, url: event.data.url || ('http://127.0.0.1:' + event.data.port) });
    } else if (event.type === 'dev_server_stopped') {
      setDevServer({ running: false, port: null, url: '' });
    } else if (event.type === 'experience_proposed') {
      setAgentEvents(function(p) { return p.concat([{ type: 'experience', text: 'Experience candidate created', time: new Date().toLocaleTimeString(), data: event.data, clickable: true }]); });
    }
  }

  function addOutputLog(text, level) {
    setOutputLogs(function(p) { return p.concat({ text: text, level: level || 'info', time: new Date().toLocaleTimeString() }); });
  }

  // ============================================================
  // MONACO EDITOR LIFECYCLE
  // ============================================================
  useEffect(function() {
    if (window.require && editorContainerRef.current && !monacoEditorInstance.current) {
      window.require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
      window.require(['vs/editor/editor.main'], function() {
        monacoEditorInstance.current = window.monaco.editor.create(editorContainerRef.current, {
          value: '// Welcome to NexusAI Studio IDE\n// Open a file from the explorer to start editing.\n// Press Ctrl+S to save.',
          language: 'javascript',
          theme: 'vs-dark',
          automaticLayout: true,
          minimap: { enabled: true },
          fontSize: 13,
          fontFamily: "'JetBrains Mono', monospace",
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          padding: { top: 12, bottom: 12 },
        });

        monacoEditorInstance.current.onDidChangeModelContent(function() {
          var updated = monacoEditorInstance.current.getValue();
          if (activeTabPath) {
            setOpenTabs(function(tabs) {
              return tabs.map(function(t) {
                return t.path === activeTabPath ? Object.assign({}, t, { content: updated, dirty: true }) : t;
              });
            });
          }
        });
      });
    }
  }, [activeTabPath]);

  useEffect(function() {
    if (monacoEditorInstance.current && activeTabPath) {
      var activeTab = openTabs.find(function(t) { return t.path === activeTabPath; });
      if (activeTab) {
        var currentVal = monacoEditorInstance.current.getValue();
        if (currentVal !== activeTab.content) {
          var lang = getLanguageFromExt(activeTab.path);
          var model = window.monaco.editor.createModel(activeTab.content, lang);
          monacoEditorInstance.current.setModel(model);
        }
      }
    }
  }, [activeTabPath, openTabs]);

  // ============================================================
  // API CALLS
  // ============================================================
  function loadActiveProject() {
    fetch('/api/project/active').then(function(r) { return r.json(); }).then(function(data) {
      setActiveProject(data);
      loadWorkspaceTree();
    });
  }

  function loadWorkspaceTree() {
    fetch('/api/workspace/tree').then(function(r) { return r.json(); }).then(function(data) { setFileTree(data); });
  }

  function loadSettings() {
    fetch('/api/settings').then(function(r) { return r.json(); }).then(function(data) { setSettings(data); });
  }

  function loadGitStatus() {
    fetch('/api/git/status').then(function(r) { return r.json(); }).then(function(data) { setGitStatus(data); });
  }

  function loadGitLog() {
    fetch('/api/git/log').then(function(r) { return r.json(); }).then(function(data) { setGitLog(data.commits || []); });
  }

  function loadExperiences() {
    fetch('/api/experience/search?q=' + encodeURIComponent(expSearch))
      .then(function(r) { return r.json(); })
      .then(function(data) { setExperiences(data); });
  }

  function loadPresets() {
    fetch('/api/providers/presets').then(function(r) { return r.json(); }).then(function(data) { setPresets(data); });
  }

  function checkDevServer() {
    fetch('/api/preview/status').then(function(r) { return r.json(); }).then(function(data) { setDevServer(data); });
  }

  function openFile(filePath) {
    var existing = openTabs.find(function(t) { return t.path === filePath; });
    if (existing) { setActiveTabPath(filePath); return; }
    fetch('/api/workspace/file?path=' + encodeURIComponent(filePath))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var newTab = { path: filePath, name: filePath.split('/').pop(), content: data.content, dirty: false };
        setOpenTabs(function(tabs) { return tabs.concat([newTab]); });
        setActiveTabPath(filePath);
      });
  }

  function closeTab(e, path) {
    e.stopPropagation();
    var filtered = openTabs.filter(function(t) { return t.path !== path; });
    setOpenTabs(filtered);
    if (activeTabPath === path) {
      setActiveTabPath(filtered.length > 0 ? filtered[filtered.length - 1].path : null);
    }
  }

  function saveCurrentFile() {
    var activeTab = openTabs.find(function(t) { return t.path === activeTabPath; });
    if (!activeTab || !monacoEditorInstance.current) return;
    var content = monacoEditorInstance.current.getValue();
    fetch('/api/workspace/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: activeTab.path, content: content })
    }).then(function() {
      setOpenTabs(function(tabs) {
        return tabs.map(function(t) {
          return t.path === activeTab.path ? Object.assign({}, t, { dirty: false, content: content }) : t;
        });
      });
      refreshPreview();
      loadGitStatus();
    });
  }

  function runTerminalCmd(e) {
    if (e.key === 'Enter' && terminalInput.trim()) {
      var cmd = terminalInput.trim();
      setTerminalInput('');
      setTerminalLogs(function(p) { return p.concat({ text: '$ ' + cmd, type: 'cmd' }); });
      fetch('/api/terminal/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var out = (data.stdout || '') + (data.stderr || '');
        setTerminalLogs(function(p) { return p.concat({ text: out || '(no output)', type: data.code === 0 ? 'success' : 'error' }); });
        loadWorkspaceTree();
      });
    }
  }

  function handleAgentSubmit() {
    if (!agentPrompt.trim() || agentRunning) return;
    var prompt = agentPrompt.trim();
    setAgentPrompt('');
    setAgentRunning(true);
    setAgentEvents([]);
    setCurrentPlan('');
    setAnalysisText('');
    fetch('/api/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt, auto_repair: true })
    }).then(function(r) { return r.json(); }).then(function(data) {
      if (!data.success) {
        addOutputLog('Agent build failed: ' + data.result, 'error');
      }
    }).catch(function(err) {
      addOutputLog('Network error: ' + err, 'error');
      setAgentRunning(false);
    });
  }

  function respondToApproval(requestId, approved, remember) {
    fetch('/api/approval/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: requestId, approved: approved, remember: remember || false })
    });
    setApprovalRequest(null);
  }

  function testLLM() {
    setTestResult({ loading: true });
    var config = Object.assign({}, settings.ai);
    delete config.has_api_key;
    fetch('/api/llm/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    })
    .then(function(r) { return r.json(); })
    .then(function(res) { setTestResult(res); });
  }

  function saveSettingsConfig() {
    var config = Object.assign({}, settings);
    var aiConfig = Object.assign({}, config.ai);
    delete aiConfig.has_api_key;
    config.ai = aiConfig;
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    }).then(function() {
      loadSettings();
    });
  }

  function clearApiKey() {
    fetch('/api/settings/credentials', { method: 'DELETE' })
      .then(function() { loadSettings(); });
  }

  function startDevServer() {
    fetch('/api/preview/start', { method: 'POST' })
      .then(function(r) { return r.json(); })
      .then(function(data) { setDevServer({ running: true, port: data.port, url: data.url }); });
  }

  function stopDevServer() {
    fetch('/api/preview/stop', { method: 'POST' })
      .then(function() { setDevServer({ running: false, port: null, url: '' }); });
  }

  function refreshPreview() {
    if (previewIframeRef.current) {
      previewIframeRef.current.src = '/sandbox/index.html?t=' + Date.now();
    }
  }

  function handleSearchWorkspace() {
    if (!searchQuery.trim()) return;
    fetch('/api/workspace/search?q=' + encodeURIComponent(searchQuery))
      .then(function(r) { return r.json(); })
      .then(function(results) { setSearchResults(results); });
  }

  function handleCommit() {
    if (!commitMsg.trim()) return;
    fetch('/api/git/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: commitMsg })
    }).then(function() {
      setCommitMsg('');
      loadGitStatus();
      loadGitLog();
    });
  }

  function handleGitAction(action) {
    fetch('/api/git/' + action, { method: 'POST' })
      .then(function(r) { return r.json(); })
      .then(function() { loadGitStatus(); loadGitLog(); });
  }

  function stageFile(path) {
    fetch('/api/git/stage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: path }) })
      .then(function() { loadGitStatus(); });
  }

  function unstageFile(path) {
    fetch('/api/git/unstage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: path }) })
      .then(function() { loadGitStatus(); });
  }

  function viewDiff(path) {
    fetch('/api/git/diff?path=' + encodeURIComponent(path))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        setDiffViewer({ path: path, diff: data.diff });
      });
  }

  function createFileOrDir(parentPath, isDir) {
    var name = prompt('Enter ' + (isDir ? 'folder' : 'file') + ' name:');
    if (!name) return;
    var fullPath = parentPath ? parentPath + '/' + name : name;
    fetch('/api/workspace/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fullPath, is_dir: isDir })
    }).then(function() { loadWorkspaceTree(); });
  }

  function deleteEntry(path) {
    if (!confirm('Delete "' + path + '"?')) return;
    fetch('/api/workspace/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: path })
    }).then(function() { loadWorkspaceTree(); loadGitStatus(); });
  }

  function renameEntry(path) {
    var newName = prompt('Rename to:', path);
    if (!newName || newName === path) return;
    fetch('/api/workspace/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: path, new_path: newName })
    }).then(function() { loadWorkspaceTree(); });
  }

  function showContextMenu(e, node) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX, y: e.clientY,
      node: node,
    });
  }

  function closeContextMenu() { setContextMenu(null); }

  function publishExperience(exp) {
    fetch('/api/experience/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: exp.title, problem: exp.problem, solution: exp.solution,
        context: exp.context, environment: exp.environment, tags: exp.tags,
      })
    }).then(function() { loadExperiences(); });
  }

  // ============================================================
  // RENDER: FILE TREE
  // ============================================================
  function renderTree(nodes) {
    return nodes.map(function(node) {
      if (node.isDir) {
        return (
          <div key={node.path}>
            <div
              className="tree-node"
              onContextMenu={function(e) { showContextMenu(e, node); }}
            >
              <span className="tree-icon">{getFileIcon(node.name, true)}</span>
              <span className="tree-label">{node.name}</span>
            </div>
            {node.children && node.children.length > 0 && (
              <div style={{ marginLeft: 12 }}>{renderTree(node.children)}</div>
            )}
          </div>
        );
      }
      return (
        <div
          key={node.path}
          className={"tree-node " + (activeTabPath === node.path ? 'active-file' : '')}
          onClick={function() { openFile(node.path); }}
          onContextMenu={function(e) { showContextMenu(e, node); }}
        >
          <span className="tree-icon">{getFileIcon(node.name, false)}</span>
          <span className="tree-label">{node.name}</span>
        </div>
      );
    });
  }

  // ============================================================
  // RENDER: AGENT EVENTS
  // ============================================================
  function renderAgentEvent(ev, idx) {
    var cardClass = 'agent-card';
    if (ev.type === 'build' || ev.type === 'test') {
      cardClass += ev.passed ? ' success' : ' error';
    } else if (ev.type === 'done') {
      cardClass += ' success';
    } else if (ev.type === 'start' || ev.type === 'step' || ev.type === 'plan' || ev.type === 'node') {
      cardClass += ' info';
    } else if (ev.type === 'file' || ev.type === 'file_action') {
      cardClass += ' success';
    } else if (ev.type === 'error') {
      cardClass += ' error';
    } else if (ev.type === 'reasoning' || ev.type === 'streaming' || ev.type === 'analysis') {
      cardClass += ' reasoning-card';
    } else if (ev.type === 'install' || ev.type === 'building' || ev.type === 'testing') {
      cardClass += ' warning';
    }
    if (ev.clickable) cardClass += ' clickable';

    var icon = '⚡';
    if (ev.type === 'file' || ev.type === 'file_action') icon = '📄';
    else if (ev.type === 'build') icon = ev.passed ? '✓' : '✗';
    else if (ev.type === 'test') icon = ev.passed ? '✓' : '✗';
    else if (ev.type === 'done') icon = '🎉';
    else if (ev.type === 'plan') icon = '📋';
    else if (ev.type === 'command') icon = '$';
    else if (ev.type === 'experience') icon = '🌐';
    else if (ev.type === 'reasoning' || ev.type === 'streaming') icon = '💭';
    else if (ev.type === 'analysis') icon = '🔍';
    else if (ev.type === 'error') icon = '⚠';
    else if (ev.type === 'node') icon = '◦';
    else if (ev.type === 'install') icon = '📦';
    else if (ev.type === 'building') icon = '🔨';
    else if (ev.type === 'testing') icon = '🧪';

    // Reasoning and streaming tokens get special rendering
    if (ev.type === 'reasoning' || ev.type === 'streaming' || ev.type === 'analysis') {
      return (
        <div key={idx} className={cardClass}>
          <div className="agent-card-header">
            <span>{icon}</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-dim)' }}>
              {ev.type === 'reasoning' ? 'Reasoning' : ev.type === 'analysis' ? 'Analysis' : 'Thinking'}
            </span>
          </div>
          <div className="agent-card-body" style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.5, marginTop: 4 }}>
            {ev.text}
          </div>
        </div>
      );
    }

    // Error events with expandable traceback
    if (ev.type === 'error') {
      return (
        <div
          key={idx}
          className={cardClass}
          onClick={ev.clickable ? function() { viewEventDetail(ev); } : null}
        >
          <div className="agent-card-header" style={{ color: 'var(--danger)' }}>
            <span>{icon}</span>
            <span>{ev.text.substring(0, 200)}</span>
          </div>
          {ev.data && ev.data.traceback && (
            <div className="agent-card-body" style={{ color: 'var(--danger)', fontSize: 10, marginTop: 4 }}>
              Click to view full error trace
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        key={idx}
        className={cardClass}
        onClick={ev.clickable ? function() { viewEventDetail(ev); } : null}
      >
        <div className="agent-card-header">
          <span>{icon}</span>
          <span>{ev.text}</span>
        </div>
        {ev.time && <div className="agent-card-meta"><span>{ev.time}</span></div>}
      </div>
    );
  }

  function viewEventDetail(ev) {
    if (ev.type === 'command' && ev.data) {
      setDiffViewer({ title: 'Command Output', command: ev.data.command, output: ev.data.stdout || ev.data.stderr || '' });
    } else if (ev.type === 'build' && ev.data) {
      setDiffViewer({ title: 'Build Output', output: ev.data.output || '' });
    } else if (ev.type === 'experience' && ev.data && ev.data.experience) {
      setDiffViewer({ title: 'Experience Proposal', experience: ev.data.experience });
    }
  }

  // ============================================================
  // RENDER: MAIN
  // ============================================================
  return (
    <div className="nexus-app">
      {/* ===== TOP BAR ===== */}
      <header className="nexus-topbar">
        <div className="topbar-brand">
          <div className="brand-icon">N</div>
          <span className="brand-name">NexusAI Studio</span>
        </div>

        <div className="topbar-center">
          <span>📁 {activeProject.name || 'No Project Open'}</span>
          <button className="icon-btn" onClick={function() { setShowNewProjectModal(true); }} title="New Project (Ctrl+P)">+</button>
          <button className="icon-btn" onClick={function() {
            var p = prompt('Open project folder path:');
            if (p) {
              fetch('/api/project/open', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: p })
              }).then(function(r) { return r.json(); }).then(function(d) {
                setActiveProject(d); loadWorkspaceTree(); loadGitStatus(); refreshPreview();
              });
            }
          }} title="Open Folder">📂</button>
          {devServer.running ? (
            <button className="icon-btn" onClick={stopDevServer} title="Stop Dev Server">⏹</button>
          ) : (
            <button className="icon-btn" onClick={startDevServer} title="Start Dev Server">▶</button>
          )}
        </div>

        <div className="topbar-right">
          <div className="provider-pill">
            <div className="pill-dot"></div>
            <span>{settings.ai.provider_name} · {settings.ai.model.split('/').pop()}</span>
          </div>
          <button className="icon-btn" onClick={function() { setShowPreview(!showPreview); }} title="Toggle Preview">👁</button>
          <button className="icon-btn" onClick={saveCurrentFile} title="Save (Ctrl+S)">💾</button>
          <button className="icon-btn" onClick={function() { setShowSettingsModal(true); }} title="Settings (Ctrl+,)">⚙</button>
        </div>
      </header>

      {/* ===== WORKBENCH ===== */}
      <div
        className={"nexus-workbench" + (showAgentPanel ? '' : ' no-agent') + (showSidebar ? '' : ' no-sidebar')}
        style={{
          gridTemplateColumns: [
            '48px',
            (showSidebar ? (sidebarWidth + 'px') : '0px'),
            (showSidebar ? '4px' : '0px'),  // sidebar resizer
            '1fr',
            (showAgentPanel ? '4px' : '0px'),  // agent resizer
            (showAgentPanel ? (agentPanelWidth + 'px') : '0px'),
          ].join(' '),
        }}
      >
        {/* Activity Bar */}
        <aside className="activity-bar">
          <button className={"activity-btn " + (activeView === 'explorer' && showSidebar ? 'active' : '')} onClick={function() { if (activeView === 'explorer' && showSidebar) { setShowSidebar(false); } else { setActiveView('explorer'); setShowSidebar(true); } }} title="Explorer">📁</button>
          <button className={"activity-btn " + (activeView === 'search' && showSidebar ? 'active' : '')} onClick={function() { if (activeView === 'search' && showSidebar) { setShowSidebar(false); } else { setActiveView('search'); setShowSidebar(true); } }} title="Search">🔍</button>
          <button className={"activity-btn " + (activeView === 'git' && showSidebar ? 'active' : '')} onClick={function() { if (activeView === 'git' && showSidebar) { setShowSidebar(false); } else { setActiveView('git'); setShowSidebar(true); loadGitStatus(); loadGitLog(); } }} title="Source Control">🌿
            {gitStatus.changes && gitStatus.changes.length > 0 && <span className="activity-badge">{gitStatus.changes.length}</span>}
          </button>
          <button className={"activity-btn " + (activeView === 'experience' && showSidebar ? 'active' : '')} onClick={function() { if (activeView === 'experience' && showSidebar) { setShowSidebar(false); } else { setActiveView('experience'); setShowSidebar(true); loadExperiences(); } }} title="NexusAI Network">🌐</button>

          <div style={{ flex: 1 }}></div>

          <button className={"activity-btn " + (showAgentPanel ? 'active' : '')} onClick={function() { setShowAgentPanel(!showAgentPanel); }} title="Toggle AI Agent">🤖</button>
          <button className={"activity-btn " + (showBottomPanel ? 'active' : '')} onClick={function() { setShowBottomPanel(!showBottomPanel); }} title="Toggle Panel">▤</button>
          <button className="activity-btn" onClick={function() { setShowSettingsModal(true); }} title="Settings">⚙</button>
        </aside>

        {/* Sidebar */}
        {showSidebar && (
        <div className="workbench-sidebar">
          {activeView === 'explorer' && (
            <React.Fragment>
              <div className="sidebar-header">
                <span>Explorer</span>
                <div className="sidebar-actions">
                  <button className="icon-btn" onClick={function() { createFileOrDir('', false); }} title="New File">📄</button>
                  <button className="icon-btn" onClick={function() { createFileOrDir('', true); }} title="New Folder">📁</button>
                  <button className="icon-btn" onClick={loadWorkspaceTree} title="Refresh">🔄</button>
                </div>
              </div>
              <div className="sidebar-content">
                {fileTree.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">📂</div>
                    <div>Workspace is empty</div>
                    <div className="text-xs mt-1">Create a new file or project</div>
                  </div>
                ) : renderTree(fileTree)}
              </div>
            </React.Fragment>
          )}

          {activeView === 'search' && (
            <React.Fragment>
              <div className="sidebar-header">Search Workspace</div>
              <div className="sidebar-content">
                <input
                  className="form-control"
                  placeholder="Find in files..."
                  value={searchQuery}
                  onChange={function(e) { setSearchQuery(e.target.value); }}
                  onKeyDown={function(e) { if (e.key === 'Enter') handleSearchWorkspace(); }}
                />
                <div style={{ marginTop: 12 }}>
                  {searchResults.map(function(res, idx) {
                    return (
                      <div key={idx} className="tree-node" onClick={function() { openFile(res.file); }}>
                        <span className="text-cyan text-sm font-mono">{res.file}:{res.line}</span>
                        <div className="text-xs text-dim" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{res.content}</div>
                      </div>
                    );
                  })}
                  {searchResults.length === 0 && searchQuery && (
                    <div className="text-dim text-sm mt-2">No results</div>
                  )}
                </div>
              </div>
            </React.Fragment>
          )}

          {activeView === 'git' && (
            <React.Fragment>
              <div className="sidebar-header">
                <span>Source Control</span>
                <div className="sidebar-actions">
                  <button className="icon-btn" onClick={function() { handleGitAction('pull'); }} title="Pull">⬇</button>
                  <button className="icon-btn" onClick={function() { handleGitAction('push'); }} title="Push">⬆</button>
                  <button className="icon-btn" onClick={loadGitStatus} title="Refresh">🔄</button>
                </div>
              </div>
              <div className="sidebar-content">
                {!gitStatus.is_repo ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">🌿</div>
                    <div>Not a git repository</div>
                    <button className="btn-secondary mt-2" onClick={function() { handleGitAction('init'); }}>Initialize Repository</button>
                  </div>
                ) : (
                  <React.Fragment>
                    <div className="text-cyan text-sm font-bold mb-2">⎇ {gitStatus.branch}</div>
                    {gitStatus.ahead > 0 || gitStatus.behind > 0 ? (
                      <div className="text-xs text-warning mb-2">↑{gitStatus.ahead} ↓{gitStatus.behind} from remote</div>
                    ) : null}
                    <input
                      className="form-control"
                      placeholder="Commit message..."
                      value={commitMsg}
                      onChange={function(e) { setCommitMsg(e.target.value); }}
                    />
                    <button className="btn-primary w-full mt-2" onClick={handleCommit}>Commit Changes</button>
                    <div className="text-xs font-bold text-muted mt-3 mb-1">CHANGES ({gitStatus.changes.length})</div>
                    {gitStatus.changes.map(function(c, i) {
                      var color = c.x === '?' ? 'text-success' : (c.x !== ' ' ? 'text-warning' : 'text-muted');
                      return (
                        <div key={i} className="tree-node" onClick={function() { viewDiff(c.path); }}>
                          <span className={"text-xs font-bold " + color} style={{ width: 24 }}>{c.status}</span>
                          <span className="tree-label text-sm">{c.path}</span>
                          <div className="tree-actions">
                            <button className="tree-action" onClick={function(e) { e.stopPropagation(); stageFile(c.path); }} title="Stage">+</button>
                            <button className="tree-action" onClick={function(e) { e.stopPropagation(); unstageFile(c.path); }} title="Unstage">−</button>
                          </div>
                        </div>
                      );
                    })}
                    {gitLog.length > 0 && (
                      <React.Fragment>
                        <div className="text-xs font-bold text-muted mt-3 mb-1">RECENT COMMITS</div>
                        {gitLog.slice(0, 8).map(function(c, i) {
                          return (
                            <div key={i} className="tree-node">
                              <span className="text-xs font-mono text-cyan">{c.hash}</span>
                              <span className="tree-label text-xs">{c.message}</span>
                            </div>
                          );
                        })}
                      </React.Fragment>
                    )}
                  </React.Fragment>
                )}
              </div>
            </React.Fragment>
          )}

          {activeView === 'experience' && (
            <React.Fragment>
              <div className="sidebar-header">
                <span>NexusAI Network</span>
                <button className="icon-btn" onClick={loadExperiences} title="Refresh">🔄</button>
              </div>
              <div className="sidebar-content">
                <input
                  className="form-control"
                  placeholder="Search experiences..."
                  value={expSearch}
                  onChange={function(e) { setExpSearch(e.target.value); }}
                  onKeyDown={function(e) { if (e.key === 'Enter') loadExperiences(); }}
                />
                <div className="flex flex-col gap-2 mt-3">
                  {experiences.map(function(exp) {
                    return (
                      <div key={exp.id} className="agent-card info">
                        <div className="agent-card-header">
                          <span className="badge badge-success">✓ Verified</span>
                          <span style={{ fontSize: 12 }}>{exp.title}</span>
                        </div>
                        <div className="agent-card-body">{truncate(exp.problem, 100)}</div>
                        <div className="agent-card-meta">
                          <span>🎯 {(exp.confidence * 100).toFixed(0)}%</span>
                          <span>🔄 {exp.verification_executions} runs</span>
                          <span>🏷 {exp.environment}</span>
                        </div>
                      </div>
                    );
                  })}
                  {experiences.length === 0 && (
                    <div className="empty-state">
                      <div className="empty-state-icon">🌐</div>
                      <div>No experiences found</div>
                    </div>
                  )}
                </div>
              </div>
            </React.Fragment>
          )}
        </div>
        )}

        {/* Sidebar resizer (between sidebar and editor) */}
        {showSidebar && (
          <div
            className="resizer resizer-vertical"
            onMouseDown={function(e) { startDrag('sidebar', e); }}
            title="Drag to resize sidebar"
          ></div>
        )}

        {/* Center Editor */}
        <div
          className={"workbench-center" + (showBottomPanel ? '' : ' no-bottom')}
          style={showBottomPanel ? { gridTemplateRows: '35px 1fr 4px ' + bottomPanelHeight + 'px' } : undefined}
        >
          {/* Tabs */}
          <div className="editor-tabs">
            {openTabs.length === 0 ? (
              <div className="tab-item text-dim" style={{ cursor: 'default' }}>No files open</div>
            ) : openTabs.map(function(tab) {
              return (
                <div
                  key={tab.path}
                  className={"tab-item " + (activeTabPath === tab.path ? 'active' : '')}
                  onClick={function() { setActiveTabPath(tab.path); }}
                >
                  <span>{getFileIcon(tab.name, false)}</span>
                  <span className="tab-name">{tab.name}</span>
                  {tab.dirty && <span className="tab-dirty"></span>}
                  <span className="tab-close" onClick={function(e) { closeTab(e, tab.path); }}>×</span>
                </div>
              );
            })}
          </div>

          {/* Monaco + Preview */}
          <div
            className={"editor-workspace-view" + (showPreview ? '' : ' no-preview')}
            style={showPreview ? {
              gridTemplateColumns: ((previewWidth * 100) + '% 4px ' + ((1 - previewWidth) * 100) + '%'),
            } : undefined}
          >
            <div ref={editorContainerRef} className="monaco-container"></div>

            {showPreview && (
              <div
                className="resizer resizer-vertical"
                onMouseDown={function(e) { startDrag('preview', e); }}
                title="Drag to resize preview"
              ></div>
            )}

            {showPreview && (
              <div className="preview-split-pane">
                <div className="preview-bar">
                  <span>Live Preview</span>
                  <div className="preview-url">
                    {devServer.running ? devServer.url : '/sandbox/index.html'}
                  </div>
                  <button className="icon-btn" onClick={refreshPreview} title="Refresh">🔄</button>
                </div>
                {devServer.running ? (
                  <iframe ref={previewIframeRef} className="preview-iframe" src={devServer.url}></iframe>
                ) : (
                  <iframe ref={previewIframeRef} className="preview-iframe" src="/sandbox/index.html"></iframe>
                )}
              </div>
            )}
          </div>

          {/* Bottom panel resizer (between editor and bottom panel) */}
          {showBottomPanel && (
            <div
              className="resizer resizer-horizontal"
              onMouseDown={function(e) { startDrag('bottom', e); }}
              title="Drag to resize panel"
            ></div>
          )}

          {/* Bottom Panel */}
          {showBottomPanel && (
          <div className="bottom-panel">
            <div className="bottom-panel-tabs">
              <span className={"bottom-tab " + (bottomTab === 'terminal' ? 'active' : '')} onClick={function() { setBottomTab('terminal'); }}>Terminal</span>
              <span className={"bottom-tab " + (bottomTab === 'problems' ? 'active' : '')} onClick={function() { setBottomTab('problems'); }}>
                Problems {problems.length > 0 && <span className="tab-badge">{problems.length}</span>}
              </span>
              <span className={"bottom-tab " + (bottomTab === 'output' ? 'active' : '')} onClick={function() { setBottomTab('output'); }}>Output</span>
              <span className={"bottom-tab " + (bottomTab === 'agent_logs' ? 'active' : '')} onClick={function() { setBottomTab('agent_logs'); }}>Agent</span>
              <span style={{ flex: 1 }}></span>
              <span className="bottom-tab" style={{ cursor: 'pointer' }} onClick={function() { setShowBottomPanel(false); }} title="Close Panel">×</span>
            </div>
            <div className="bottom-panel-content">
              {bottomTab === 'terminal' && (
                <div>
                  {terminalLogs.map(function(log, idx) {
                    return <div key={idx} className={"terminal-line " + (log.type || 'normal')}>{log.text}</div>;
                  })}
                  <div className="terminal-input-row" ref={terminalEndRef}>
                    <span className="terminal-prompt">$</span>
                    <input
                      className="terminal-input"
                      value={terminalInput}
                      onChange={function(e) { setTerminalInput(e.target.value); }}
                      onKeyDown={runTerminalCmd}
                      placeholder="Type command and press Enter..."
                    />
                  </div>
                </div>
              )}
              {bottomTab === 'problems' && (
                <div>
                  {problems.length === 0 ? (
                    <div className="text-dim text-sm">No problems detected ✓</div>
                  ) : problems.map(function(p, idx) {
                    return (
                      <div key={idx} className="terminal-line error">
                        <span className="text-danger font-bold">[{p.severity}]</span> {p.message} ({p.source})
                        {p.detail && <div className="text-dim text-xs mt-1">{truncate(p.detail, 300)}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
              {bottomTab === 'output' && (
                <div>
                  {outputLogs.length === 0 ? (
                    <div className="text-dim text-sm">No output yet</div>
                  ) : outputLogs.map(function(log, idx) {
                    return <div key={idx} className={"terminal-line " + (log.level === 'error' ? 'error' : (log.level === 'success' ? 'success' : 'normal'))}>[{log.time}] {log.text}</div>;
                  })}
                </div>
              )}
              {bottomTab === 'agent_logs' && (
                <div>
                  {currentPlan && (
                    <div className="agent-card info">
                      <div className="agent-card-header">📋 Implementation Plan</div>
                      <pre className="agent-card-body" style={{ whiteSpace: 'pre-wrap' }}>{currentPlan}</pre>
                    </div>
                  )}
                  {analysisText && (
                    <div className="agent-card info">
                      <div className="agent-card-header">🔍 Analysis</div>
                      <pre className="agent-card-body" style={{ whiteSpace: 'pre-wrap' }}>{analysisText}</pre>
                    </div>
                  )}
                  {agentEvents.map(renderAgentEvent)}
                </div>
              )}
            </div>
          </div>
          )}
        </div>

        {/* Agent panel resizer (between editor and agent panel) */}
        {showAgentPanel && (
          <div
            className="resizer resizer-vertical"
            onMouseDown={function(e) { startDrag('agent', e); }}
            title="Drag to resize agent panel"
          ></div>
        )}

        {/* Agent Panel (Right) — toggleable */}
        {showAgentPanel && (
        <aside className="workbench-agent-panel">
          <div className="agent-panel-header">
            <span>🤖 NexusAI Agent</span>
            <div className="flex items-center gap-2">
              {agentRunning ? (
                <span className="agent-status">● Executing</span>
              ) : (
                <span className="agent-status idle">● Idle</span>
              )}
              <button className="icon-btn" onClick={function() { setShowAgentPanel(false); }} title="Close Panel">×</button>
            </div>
          </div>

          <div className="agent-timeline" ref={agentTimelineRef}>
            {agentEvents.length === 0 && !currentPlan && (
              <div className="empty-state">
                <div className="empty-state-icon">🤖</div>
                <div>Agent is idle</div>
                <div className="text-xs mt-1">Describe what you want to build below</div>
              </div>
            )}
            {currentPlan && (
              <div className="agent-card info">
                <div className="agent-card-header">📋 Implementation Plan</div>
                <pre className="agent-card-body" style={{ whiteSpace: 'pre-wrap' }}>{truncate(currentPlan, 400)}</pre>
              </div>
            )}
            {agentEvents.map(renderAgentEvent)}
          </div>

          <div className="agent-prompt-box">
            <textarea
              className="agent-input"
              rows={3}
              placeholder="Ask NexusAI to build a feature, fix a bug, or run tests..."
              value={agentPrompt}
              onChange={function(e) { setAgentPrompt(e.target.value); }}
              onKeyDown={function(e) {
                if (e.key === 'Enter' && !e.shiftKey && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleAgentSubmit();
                }
              }}
            ></textarea>
            <button className="agent-btn-submit w-full" onClick={handleAgentSubmit} disabled={agentRunning || !agentPrompt.trim()}>
              {agentRunning ? (<React.Fragment><span className="spinner"></span> Building Application...</React.Fragment>) : '▶ Run Autonomous Agent'}
            </button>
          </div>
        </aside>
        )}
      </div>

      {/* ===== STATUS BAR (part of grid, not fixed) ===== */}
      <div className="status-bar">
        <div className="status-bar-section">
          <span className="status-bar-item">⎇ {gitStatus.branch || 'no-git'}</span>
          {gitStatus.changes && gitStatus.changes.length > 0 && <span className="status-bar-item">⚠ {gitStatus.changes.length} changes</span>}
        </div>
        <div className="status-bar-section">
          {devServer.running && <span className="status-bar-item">▶ Port {devServer.port}</span>}
          <span className="status-bar-item">UTF-8</span>
          <span className="status-bar-item">NexusAI v{settings.about.version}</span>
        </div>
      </div>

      {/* ===== APPROVAL MODAL ===== */}
      {approvalRequest && (
        <div className="modal-overlay">
          <div className="modal-card approval-modal">
            <div className="modal-header">
              <span>⚠ Agent Approval Required</span>
            </div>
            <div className="modal-body">
              <div className="approval-warning">
                <span>⚠</span>
                <span>The agent wants to execute a command. Review it before approving.</span>
              </div>
              <div className="form-label">Command:</div>
              <div className="approval-command-box">{approvalRequest.command}</div>
              <div className="text-xs text-dim">Tool: {approvalRequest.tool} · Workspace: {activeProject.name}</div>
            </div>
            <div className="modal-footer">
              <button className="btn-danger" onClick={function() { respondToApproval(approvalRequest.request_id, false, false); }}>Deny</button>
              <button className="btn-secondary" onClick={function() { respondToApproval(approvalRequest.request_id, false, true); }}>Allow for Project</button>
              <button className="btn-success" onClick={function() { respondToApproval(approvalRequest.request_id, true, false); }}>Allow Once</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== DIFF / DETAIL VIEWER ===== */}
      {diffViewer && (
        <div className="modal-overlay" onClick={function() { setDiffViewer(null); }}>
          <div className="modal-card wide" onClick={function(e) { e.stopPropagation(); }}>
            <div className="modal-header">
              <span>{diffViewer.title || 'Detail: ' + (diffViewer.path || '')}</span>
              <button className="icon-btn" onClick={function() { setDiffViewer(null); }}>×</button>
            </div>
            <div className="modal-body">
              {diffViewer.command && (
                <div className="mb-3">
                  <div className="form-label">Command</div>
                  <div className="approval-command-box">{diffViewer.command}</div>
                </div>
              )}
              {diffViewer.experience && (
                <div>
                  <div className="form-label">Experience Proposal</div>
                  <pre className="agent-card-body" style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(diffViewer.experience, null, 2)}</pre>
                  <button className="btn-primary mt-2" onClick={function() { publishExperience(diffViewer.experience); setDiffViewer(null); }}>Publish</button>
                </div>
              )}
              {diffViewer.diff && (
                <div className="diff-viewer">
                  {diffViewer.diff.split('\n').map(function(line, idx) {
                    var cls = 'diff-line context';
                    if (line.startsWith('+') && !line.startsWith('+++')) cls = 'diff-line added';
                    else if (line.startsWith('-') && !line.startsWith('---')) cls = 'diff-line removed';
                    else if (line.startsWith('@@') || line.startsWith('diff') || line.startsWith('---') || line.startsWith('+++')) cls = 'diff-line header';
                    return <div key={idx} className={cls}>{line || ' '}</div>;
                  })}
                </div>
              )}
              {diffViewer.output && (
                <div className="diff-viewer">
                  {diffViewer.output.split('\n').map(function(line, idx) {
                    return <div key={idx} className="diff-line context">{line || ' '}</div>;
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== CONTEXT MENU ===== */}
      {contextMenu && (
        <React.Fragment>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={closeContextMenu} onContextMenu={function(e) { e.preventDefault(); closeContextMenu(); }}></div>
          <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <div className="context-menu-item" onClick={function() { createFileOrDir(contextMenu.node.path, false); closeContextMenu(); }}>📄 New File</div>
            <div className="context-menu-item" onClick={function() { createFileOrDir(contextMenu.node.path, true); closeContextMenu(); }}>📁 New Folder</div>
            {contextMenu.node && !contextMenu.node.isDir && (
              <div className="context-menu-item" onClick={function() { openFile(contextMenu.node.path); closeContextMenu(); }}>📝 Open</div>
            )}
            <div className="context-menu-item" onClick={function() { renameEntry(contextMenu.node.path); closeContextMenu(); }}>✏ Rename</div>
            <div className="context-menu-separator"></div>
            <div className="context-menu-item danger" onClick={function() { deleteEntry(contextMenu.node.path); closeContextMenu(); }}>🗑 Delete</div>
          </div>
        </React.Fragment>
      )}

      {/* ===== SETTINGS MODAL ===== */}
      {showSettingsModal && (
        <SettingsModal
          settings={settings}
          presets={presets}
          testResult={testResult}
          onClose={function() { setShowSettingsModal(false); }}
          onSave={saveSettingsConfig}
          onTest={testLLM}
          onChange={setSettings}
          onClearKey={clearApiKey}
        />
      )}

      {/* ===== NEW PROJECT MODAL ===== */}
      {showNewProjectModal && (
        <NewProjectModal
          onClose={function() { setShowNewProjectModal(false); }}
          onCreate={function(name, template) {
            fetch('/api/project/create', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: name, template: template })
            }).then(function(r) { return r.json(); }).then(function(d) {
              setActiveProject(d); setShowNewProjectModal(false);
              loadWorkspaceTree(); loadGitStatus(); refreshPreview();
            });
          }}
        />
      )}

      {/* ===== ONBOARDING ===== */}
      {showOnboarding && (
        <OnboardingWizard
          settings={settings}
          presets={presets}
          testResult={testResult}
          onChange={setSettings}
          onTest={testLLM}
          onComplete={function() {
            saveSettingsConfig();
            localStorage.setItem('nexus_onboarded', 'true');
            setShowOnboarding(false);
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// SETTINGS MODAL COMPONENT
// ============================================================
function SettingsModal(props) {
  var [activeSection, setActiveSection] = useState('general');

  var sections = [
    { id: 'general', label: 'General', icon: '⚙' },
    { id: 'ai', label: 'AI Provider', icon: '🤖' },
    { id: 'agent', label: 'Agent', icon: '⚡' },
    { id: 'network', label: 'NexusAI Network', icon: '🌐' },
    { id: 'security', label: 'Security', icon: '🔒' },
    { id: 'about', label: 'About', icon: 'ℹ' },
  ];

  function updateAi(field, value) {
    props.onChange(Object.assign({}, props.settings, {
      ai: Object.assign({}, props.settings.ai, { [field]: value })
    }));
  }

  function updateAgent(field, value) {
    props.onChange(Object.assign({}, props.settings, {
      agent: Object.assign({}, props.settings.agent, { [field]: value })
    }));
  }

  function updateGeneral(field, value) {
    props.onChange(Object.assign({}, props.settings, {
      general: Object.assign({}, props.settings.general, { [field]: value })
    }));
  }

  function updateNetwork(field, value) {
    props.onChange(Object.assign({}, props.settings, {
      network: Object.assign({}, props.settings.network, { [field]: value })
    }));
  }

  function updateSecurity(field, value) {
    props.onChange(Object.assign({}, props.settings, {
      security: Object.assign({}, props.settings.security, { [field]: value })
    }));
  }

  function applyPreset(name) {
    var preset = props.presets[name];
    if (!preset) return;
    props.onChange(Object.assign({}, props.settings, {
      ai: Object.assign({}, props.settings.ai, {
        provider_name: name,
        provider_type: preset.provider_type,
        base_url: preset.base_url,
      })
    }));
  }

  return (
    <div className="modal-overlay" onClick={props.onClose}>
      <div className="modal-card wide full" onClick={function(e) { e.stopPropagation(); }}>
        <div className="modal-header">
          <span>⚙ Settings</span>
          <button className="icon-btn" onClick={props.onClose}>×</button>
        </div>
        <div className="settings-layout" style={{ height: '70vh' }}>
          <div className="settings-nav">
            {sections.map(function(s) {
              return (
                <div
                  key={s.id}
                  className={"settings-nav-item " + (activeSection === s.id ? 'active' : '')}
                  onClick={function() { setActiveSection(s.id); }}
                >
                  <span>{s.icon}</span>
                  <span>{s.label}</span>
                </div>
              );
            })}
          </div>
          <div className="settings-content">
            {activeSection === 'general' && (
              <div>
                <div className="settings-section-title">General</div>
                <div className="settings-section-desc">Application-wide preferences.</div>
                <div className="form-group">
                  <label className="form-label">Theme</label>
                  <select className="form-control" value={props.settings.general.theme} onChange={function(e) { updateGeneral('theme', e.target.value); }}>
                    <option value="dark-nexus">Dark Nexus (default)</option>
                    <option value="dark-blue">Dark Blue</option>
                    <option value="midnight">Midnight</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Default Project Directory</label>
                  <input className="form-control" value={props.settings.general.default_project_dir || ''} onChange={function(e) { updateGeneral('default_project_dir', e.target.value); }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Startup Behavior</label>
                  <select className="form-control" value={props.settings.general.startup_behavior} onChange={function(e) { updateGeneral('startup_behavior', e.target.value); }}>
                    <option value="restore_last">Restore last project</option>
                    <option value="open_picker">Show project picker</option>
                    <option value="empty">Start empty</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Language</label>
                  <select className="form-control" value={props.settings.general.language} onChange={function(e) { updateGeneral('language', e.target.value); }}>
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                    <option value="ar">العربية</option>
                  </select>
                </div>
              </div>
            )}

            {activeSection === 'ai' && (
              <div>
                <div className="settings-section-title">AI Provider</div>
                <div className="settings-section-desc">Configure your LLM provider. Cloud or local — any OpenAI-compatible endpoint.</div>

                <div className="form-group">
                  <label className="form-label">Quick Presets</label>
                  <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                    {Object.keys(props.presets).map(function(name) {
                      return (
                        <button key={name} className={"btn-secondary text-sm"} onClick={function() { applyPreset(name); }}>
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Provider Type</label>
                  <select className="form-control" value={props.settings.ai.provider_type} onChange={function(e) { updateAi('provider_type', e.target.value); }}>
                    <option value="cloud">☁ Cloud API</option>
                    <option value="local">💻 Local LLM</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Provider Name</label>
                  <input className="form-control" value={props.settings.ai.provider_name} onChange={function(e) { updateAi('provider_name', e.target.value); }} />
                </div>

                <div className="form-group">
                  <label className="form-label">Base URL</label>
                  <input className="form-control font-mono" value={props.settings.ai.base_url} onChange={function(e) { updateAi('base_url', e.target.value); }} placeholder="https://..." />
                </div>

                <div className="form-group">
                  <label className="form-label">API Key {props.settings.ai.has_api_key ? <span className="badge badge-success">✓ Stored</span> : <span className="badge badge-warning">Not Set</span>}</label>
                  <input
                    type="password"
                    className="form-control"
                    placeholder={props.settings.ai.has_api_key ? '•••••••• (stored securely — enter new to replace)' : 'Enter API key...'}
                    value={props.settings.ai.api_key || ''}
                    onChange={function(e) { updateAi('api_key', e.target.value); }}
                  />
                  {props.settings.ai.has_api_key && (
                    <button className="btn-danger text-sm mt-2" onClick={props.onClearKey}>🗑 Clear Stored Key</button>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Model</label>
                  <input className="form-control font-mono" value={props.settings.ai.model} onChange={function(e) { updateAi('model', e.target.value); }} />
                  {props.presets[props.settings.ai.provider_name] && props.presets[props.settings.ai.provider_name].models && props.presets[props.settings.ai.provider_name].models.length > 0 && (
                    <div className="flex gap-1 mt-2" style={{ flexWrap: 'wrap' }}>
                      {props.presets[props.settings.ai.provider_name].models.map(function(m) {
                        return <button key={m} className="btn-secondary text-xs" onClick={function() { updateAi('model', m); }}>{m}</button>;
                      })}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 mt-3">
                  <button className="btn-secondary" onClick={props.onTest}>🔍 Test Connection</button>
                  <button className="btn-primary" onClick={props.onSave}>💾 Save Settings</button>
                </div>

                {props.testResult && (
                  <div className={"mt-2 p-3 rounded-md text-sm " + (props.testResult.loading ? '' : (props.testResult.success ? 'text-success' : 'text-danger'))} style={{
                    background: props.testResult.loading ? 'var(--bg-base)' : (props.testResult.success ? 'var(--success-bg)' : 'var(--danger-bg)'),
                    border: '1px solid ' + (props.testResult.success ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)')
                  }}>
                    {props.testResult.loading ? (<React.Fragment><span className="spinner"></span> Testing...</React.Fragment>) : (props.testResult.success ? '✓ ' + props.testResult.message + (props.testResult.response ? '\nResponse: ' + props.testResult.response : '') : '✗ ' + props.testResult.message + (props.testResult.hint ? '\nHint: ' + props.testResult.hint : ''))}
                  </div>
                )}
              </div>
            )}

            {activeSection === 'agent' && (
              <div>
                <div className="settings-section-title">Agent</div>
                <div className="settings-section-desc">Control how the autonomous agent operates.</div>
                <div className="form-group">
                  <label className="form-label">Max Repair Attempts: {props.settings.agent.max_repair_attempts}</label>
                  <input type="range" min="0" max="10" value={props.settings.agent.max_repair_attempts} onChange={function(e) { updateAgent('max_repair_attempts', parseInt(e.target.value)); }} style={{ width: '100%' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    <input type="checkbox" checked={props.settings.agent.require_approval} onChange={function(e) { updateAgent('require_approval', e.target.checked); }} /> Require approval for terminal commands
                  </label>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    <input type="checkbox" checked={props.settings.agent.auto_run_commands} onChange={function(e) { updateAgent('auto_run_commands', e.target.checked); }} /> Auto-run commands (no approval)
                  </label>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    <input type="checkbox" checked={props.settings.agent.browser_testing} onChange={function(e) { updateAgent('browser_testing', e.target.checked); }} /> Enable browser testing (Playwright)
                  </label>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    <input type="checkbox" checked={props.settings.agent.build_automatically} onChange={function(e) { updateAgent('build_automatically', e.target.checked); }} /> Build automatically after implementation
                  </label>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    <input type="checkbox" checked={props.settings.agent.repair_automatically} onChange={function(e) { updateAgent('repair_automatically', e.target.checked); }} /> Repair automatically on failure
                  </label>
                </div>
              </div>
            )}

            {activeSection === 'network' && (
              <div>
                <div className="settings-section-title">NexusAI Network</div>
                <div className="settings-section-desc">Configure the experience network endpoint and sharing.</div>
                <div className="form-group">
                  <label className="form-label">Network Endpoint</label>
                  <input className="form-control font-mono" value={props.settings.network.endpoint} onChange={function(e) { updateNetwork('endpoint', e.target.value); }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Agent Identity</label>
                  <input className="form-control" value={props.settings.network.agent_identity} onChange={function(e) { updateNetwork('agent_identity', e.target.value); }} />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    <input type="checkbox" checked={props.settings.network.auto_share_experiences} onChange={function(e) { updateNetwork('auto_share_experiences', e.target.checked); }} /> Auto-share verified experiences
                  </label>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    <input type="checkbox" checked={props.settings.network.auto_retrieve_experiences} onChange={function(e) { updateNetwork('auto_retrieve_experiences', e.target.checked); }} /> Auto-retrieve relevant experiences
                  </label>
                </div>
              </div>
            )}

            {activeSection === 'security' && (
              <div>
                <div className="settings-section-title">Security</div>
                <div className="settings-section-desc">Workspace boundaries and command safety.</div>
                <div className="form-group">
                  <label className="form-label">
                    <input type="checkbox" checked={props.settings.security.allowed_workspace_only} onChange={function(e) { updateSecurity('allowed_workspace_only', e.target.checked); }} /> Restrict agent to active workspace only
                  </label>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    <input type="checkbox" checked={props.settings.security.allow_terminal} onChange={function(e) { updateSecurity('allow_terminal', e.target.checked); }} /> Allow terminal execution
                  </label>
                </div>
              </div>
            )}

            {activeSection === 'about' && (
              <div>
                <div className="settings-section-title">About NexusAI Studio</div>
                <div className="settings-section-desc">Build and version information.</div>
                <div className="agent-card info">
                  <div className="agent-card-header">NexusAI Studio IDE</div>
                  <div className="agent-card-body">
                    Version: {props.settings.about.version}<br/>
                    Build: {props.settings.about.build}<br/>
                    License: MIT
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={props.onClose}>Close</button>
          <button className="btn-primary" onClick={props.onSave}>💾 Save</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// NEW PROJECT MODAL
// ============================================================
function NewProjectModal(props) {
  var [name, setName] = useState('my-app');
  var [template, setTemplate] = useState('vanilla');
  var [parentDir, setParentDir] = useState('');

  var templates = [
    { id: 'empty', label: 'Empty Project', icon: '📁' },
    { id: 'vanilla', label: 'Vanilla HTML/CSS/JS', icon: '🌐' },
    { id: 'react', label: 'React + Vite', icon: '⚛' },
    { id: 'python', label: 'Python (FastAPI)', icon: '🐍' },
    { id: 'node', label: 'Node.js', icon: '📦' },
  ];

  return (
    <div className="modal-overlay" onClick={props.onClose}>
      <div className="modal-card" onClick={function(e) { e.stopPropagation(); }}>
        <div className="modal-header">
          <span>📁 Create / Open Project</span>
          <button className="icon-btn" onClick={props.onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Project Name</label>
            <input className="form-control" value={name} onChange={function(e) { setName(e.target.value); }} placeholder="my-awesome-app" />
          </div>
          <div className="form-group">
            <label className="form-label">Parent Directory (optional)</label>
            <input className="form-control font-mono" value={parentDir} onChange={function(e) { setParentDir(e.target.value); }} placeholder="defaults to ./projects" />
          </div>
          <div className="form-group">
            <label className="form-label">Template</label>
            <div className="flex flex-col gap-2">
              {templates.map(function(t) {
                return (
                  <div
                    key={t.id}
                    className={"choice-card " + (template === t.id ? 'selected' : '')}
                    onClick={function() { setTemplate(t.id); }}
                    style={{ padding: 12 }}
                  >
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 20 }}>{t.icon}</span>
                      <span className="font-bold">{t.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={props.onClose}>Cancel</button>
          <button className="btn-primary" onClick={function() { props.onCreate(name, template); }} disabled={!name.trim()}>Create & Open</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ONBOARDING WIZARD
// ============================================================
function OnboardingWizard(props) {
  var [step, setStep] = useState(0);

  function chooseProvider(type, name) {
    var preset = props.presets[name] || {};
    props.onChange(Object.assign({}, props.settings, {
      ai: Object.assign({}, props.settings.ai, {
        provider_type: type,
        provider_name: name,
        base_url: preset.base_url || '',
        model: preset.models && preset.models[0] ? preset.models[0] : props.settings.ai.model,
      })
    }));
    setStep(2);
  }

  function updateAi(field, value) {
    props.onChange(Object.assign({}, props.settings, {
      ai: Object.assign({}, props.settings.ai, { [field]: value })
    }));
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card wide">
        <div className="modal-body">
          {step === 0 && (
            <div className="onboarding-screen">
              <div className="onboarding-logo">N</div>
              <div className="onboarding-title">Welcome to NexusAI</div>
              <div className="onboarding-subtitle">
                Your AI-powered development environment.<br/>
                Build, test, and ship software with an autonomous agent.
              </div>
              <button className="btn-primary" onClick={function() { setStep(1); }}>Get Started →</button>
            </div>
          )}

          {step === 1 && (
            <div className="onboarding-screen">
              <div className="onboarding-title">Choose AI Runtime</div>
              <div className="onboarding-subtitle">How do you want to run your AI model?</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 540 }}>
                <div className="choice-card" onClick={function() { chooseProvider('cloud', 'OpenRouter'); }}>
                  <div className="choice-card-icon">☁</div>
                  <div className="choice-card-title">Cloud API</div>
                  <div className="choice-card-desc">OpenRouter, OpenAI, DeepSeek, Anthropic — any OpenAI-compatible endpoint. Best for performance.</div>
                </div>
                <div className="choice-card" onClick={function() { chooseProvider('local', 'Ollama'); }}>
                  <div className="choice-card-icon">💻</div>
                  <div className="choice-card-title">Local LLM</div>
                  <div className="choice-card-desc">Ollama, LM Studio, vLLM — runs entirely offline on your machine. Private.</div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="onboarding-screen">
              <div className="onboarding-title">Configure Provider</div>
              <div className="onboarding-subtitle">Connect to your chosen LLM endpoint.</div>
              <div style={{ width: '100%', maxWidth: 480 }}>
                <div className="form-group">
                  <label className="form-label">Base URL</label>
                  <input className="form-control font-mono" value={props.settings.ai.base_url} onChange={function(e) { updateAi('base_url', e.target.value); }} />
                </div>
                {props.settings.ai.provider_type === 'cloud' && (
                  <div className="form-group">
                    <label className="form-label">API Key</label>
                    <input type="password" className="form-control" placeholder="Enter API key..." value={props.settings.ai.api_key || ''} onChange={function(e) { updateAi('api_key', e.target.value); }} />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Model</label>
                  <input className="form-control font-mono" value={props.settings.ai.model} onChange={function(e) { updateAi('model', e.target.value); }} />
                  {props.presets[props.settings.ai.provider_name] && props.presets[props.settings.ai.provider_name].models && (
                    <div className="flex gap-1 mt-2" style={{ flexWrap: 'wrap' }}>
                      {props.presets[props.settings.ai.provider_name].models.map(function(m) {
                        return <button key={m} className="btn-secondary text-xs" onClick={function() { updateAi('model', m); }}>{m}</button>;
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button className="btn-secondary" onClick={props.onTest}>🔍 Test Connection</button>
                <button className="btn-primary" onClick={function() { setStep(3); }}>Continue →</button>
              </div>
              {props.testResult && (
                <div className={"mt-2 p-3 rounded-md text-sm " + (props.testResult.success ? 'text-success' : 'text-danger')} style={{
                  background: props.testResult.success ? 'var(--success-bg)' : 'var(--danger-bg)',
                  border: '1px solid ' + (props.testResult.success ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'),
                  maxWidth: 480, width: '100%'
                }}>
                  {props.testResult.loading ? 'Testing...' : (props.testResult.success ? '✓ ' + props.testResult.message : '✗ ' + props.testResult.message + (props.testResult.hint ? '\n' + props.testResult.hint : ''))}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="onboarding-screen">
              <div className="onboarding-title">You're Ready! 🎉</div>
              <div className="onboarding-subtitle">
                NexusAI is configured and ready to build.<br/>
                Create or open a project to start coding with your AI agent.
              </div>
              <button className="btn-primary" onClick={props.onComplete}>Enter Studio →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<NexusStudioApp />);
