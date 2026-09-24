/* NexusAI Studio IDE — Full Desktop Developer Experience */
/* eslint-disable */

var useState = React.useState;
var useEffect = React.useEffect;
var useRef = React.useRef;
var useCallback = React.useCallback;

// Helpers for Monaco language detection
function getLanguageFromExt(filepath) {
  if (!filepath) return 'plaintext';
  var ext = filepath.split('.').pop().toLowerCase();
  switch (ext) {
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'html':
      return 'html';
    case 'css':
      return 'css';
    case 'json':
      return 'json';
    case 'py':
      return 'python';
    case 'md':
      return 'markdown';
    default:
      return 'plaintext';
  }
}

function NexusStudioApp() {
  // Navigation & View State
  var [activeView, setActiveView] = useState('explorer'); // explorer, search, git, experience, settings
  var [bottomTab, setBottomTab] = useState('terminal'); // terminal, problems, output, agent_logs
  var [showPreview, setShowPreview] = useState(true);
  var [showNewProjectModal, setShowNewProjectModal] = useState(false);
  var [showSettingsModal, setShowSettingsModal] = useState(false);

  // Project & Workspace State
  var [activeProject, setActiveProject] = useState({ path: '', name: 'Loading...', recent: [] });
  var [fileTree, setFileTree] = useState([]);
  var [openTabs, setOpenTabs] = useState([]); // [{ path, name, dirty, content }]
  var [activeTabPath, setActiveTabPath] = useState(null);

  // Agent State
  var [agentPrompt, setAgentPrompt] = useState('');
  var [agentRunning, setAgentRunning] = useState(false);
  var [agentEvents, setAgentEvents] = useState([]);
  var [currentPlan, setCurrentPlan] = useState('');

  // Terminal State
  var [terminalInput, setTerminalInput] = useState('');
  var [terminalLogs, setTerminalLogs] = useState([]);

  // Git State
  var [gitStatus, setGitStatus] = useState({ is_repo: false, branch: '', changes: [] });
  var [commitMsg, setCommitMsg] = useState('');

  // Experiences
  var [experiences, setExperiences] = useState([]);
  var [expSearch, setExpSearch] = useState('');

  // Search in Workspace
  var [searchQuery, setSearchQuery] = useState('');
  var [searchResults, setSearchResults] = useState([]);

  // Settings State
  var [settings, setSettings] = useState({
    general: { theme: 'dark-nexus' },
    ai: { provider_name: 'OpenRouter', base_url: 'https://openrouter.ai/api/v1', api_key: '', model: 'google/gemini-2.0-flash-exp:free' },
    agent: { max_repair_attempts: 3, auto_run_commands: true }
  });
  var [testResult, setTestResult] = useState(null);

  // Monaco Editor Reference
  var editorContainerRef = useRef(null);
  var monacoEditorInstance = useRef(null);
  var previewIframeRef = useRef(null);

  // -------------------------------------------------------------
  // INITIALIZATION & WEBSOCKET
  // -------------------------------------------------------------
  useEffect(function() {
    loadActiveProject();
    loadSettings();
    loadGitStatus();
    loadExperiences();

    // WebSocket Stream
    var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    var wsUrl = protocol + '//' + window.location.host + '/ws/logs';
    var socket = new WebSocket(wsUrl);

    socket.onmessage = function(event) {
      try {
        var payload = JSON.parse(event.data);
        handleWsEvent(payload);
      } catch (e) {
        console.error('WS Error parse:', e);
      }
    };

    return function() {
      socket.close();
    };
  }, []);

  function handleWsEvent(event) {
    if (event.type === 'agent_started') {
      setAgentRunning(true);
      setAgentEvents(function(prev) { return prev.concat([{ type: 'start', text: event.text, time: new Date().toLocaleTimeString() }]); });
    } else if (event.type === 'agent_step') {
      setAgentEvents(function(prev) { return prev.concat([{ type: 'step', text: event.text, time: new Date().toLocaleTimeString() }]); });
    } else if (event.type === 'plan_ready') {
      setCurrentPlan(event.data.plan || event.text);
      setAgentEvents(function(prev) { return prev.concat([{ type: 'plan', text: 'Plan Generated', data: event.data, time: new Date().toLocaleTimeString() }]); });
    } else if (event.type === 'file_written' || event.type === 'file_edited') {
      loadWorkspaceTree();
      refreshPreview();
      setAgentEvents(function(prev) { return prev.concat([{ type: 'file', text: event.text, time: new Date().toLocaleTimeString() }]); });
    } else if (event.type === 'build_result') {
      setAgentEvents(function(prev) { return prev.concat([{ type: 'build', text: event.text, passed: event.data.passed, time: new Date().toLocaleTimeString() }]); });
    } else if (event.type === 'agent_finished') {
      setAgentRunning(false);
      loadWorkspaceTree();
      refreshPreview();
      setAgentEvents(function(prev) { return prev.concat([{ type: 'done', text: event.text, time: new Date().toLocaleTimeString() }]); });
    } else if (event.type === 'terminal_output' || event.type === 'terminal_input') {
      setTerminalLogs(function(prev) { return prev.concat([event.text]); });
    }
  }

  // -------------------------------------------------------------
  // MONACO EDITOR LIFECYCLE
  // -------------------------------------------------------------
  useEffect(function() {
    if (window.require && editorContainerRef.current && !monacoEditorInstance.current) {
      window.require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
      window.require(['vs/editor/editor.main'], function() {
        monacoEditorInstance.current = window.monaco.editor.create(editorContainerRef.current, {
          value: '// Welcome to NexusAI Studio IDE\n// Open a file from the explorer to start editing.',
          language: 'javascript',
          theme: 'vs-dark',
          automaticLayout: true,
          minimap: { enabled: true },
          fontSize: 13,
          fontFamily: "'JetBrains Mono', monospace",
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
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

  // Update Monaco content when switching tabs
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

  // -------------------------------------------------------------
  // API CALLS
  // -------------------------------------------------------------
  function loadActiveProject() {
    fetch('/api/project/active')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        setActiveProject(data);
        loadWorkspaceTree();
      });
  }

  function loadWorkspaceTree() {
    fetch('/api/workspace/tree')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        setFileTree(data);
      });
  }

  function loadSettings() {
    fetch('/api/settings')
      .then(function(r) { return r.json(); })
      .then(function(data) { setSettings(data); });
  }

  function loadGitStatus() {
    fetch('/api/git/status')
      .then(function(r) { return r.json(); })
      .then(function(data) { setGitStatus(data); });
  }

  function loadExperiences() {
    fetch('/api/experience/search?q=' + encodeURIComponent(expSearch))
      .then(function(r) { return r.json(); })
      .then(function(data) { setExperiences(data); });
  }

  function openFile(filePath) {
    var existing = openTabs.find(function(t) { return t.path === filePath; });
    if (existing) {
      setActiveTabPath(filePath);
      return;
    }

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
    });
  }

  function runTerminalCmd(e) {
    if (e.key === 'Enter' && terminalInput.trim()) {
      var cmd = terminalInput.trim();
      setTerminalInput('');
      setTerminalLogs(function(p) { return p.concat(['$ ' + cmd]); });

      fetch('/api/terminal/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var out = (data.stdout || '') + (data.stderr || '');
        setTerminalLogs(function(p) { return p.concat([out || '(no output)']); });
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

    fetch('/api/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt, auto_repair: true })
    });
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
    });
  }

  function testLLM() {
    setTestResult({ loading: true });
    fetch('/api/llm/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings.ai)
    })
    .then(function(r) { return r.json(); })
    .then(function(res) { setTestResult(res); });
  }

  function saveSettingsConfig() {
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    }).then(function() {
      setShowSettingsModal(false);
    });
  }

  // -------------------------------------------------------------
  // RENDER HELPERS
  // -------------------------------------------------------------
  function renderTree(nodes) {
    return nodes.map(function(node) {
      if (node.isDir) {
        return (
          <div key={node.path} style={{ marginLeft: 8 }}>
            <div className="tree-node">📁 {node.name}</div>
            {node.children && renderTree(node.children)}
          </div>
        );
      }
      return (
        <div
          key={node.path}
          className={"tree-node " + (activeTabPath === node.path ? "active-file" : "")}
          onClick={function() { openFile(node.path); }}
        >
          📄 {node.name}
        </div>
      );
    });
  }

  return (
    <div className="nexus-app">
      {/* ── TOP BAR ── */}
      <header className="nexus-topbar">
        <div className="topbar-brand">
          <div className="brand-icon">N</div>
          <span>NexusAI Studio</span>
        </div>

        <div className="topbar-center">
          <span>📁 {activeProject.name || 'No Project Open'}</span>
          <button className="icon-btn-sm" onClick={function() { setShowNewProjectModal(true); }} title="New/Open Project">+</button>
        </div>

        <div className="topbar-right">
          <div className="provider-pill">
            <div className="pill-dot"></div>
            <span>{settings.ai.provider_name} ({settings.ai.model.split('/').pop()})</span>
          </div>
          <button className="icon-btn-sm" onClick={function() { setShowPreview(!showPreview); }} title="Toggle Preview">👁️</button>
          <button className="icon-btn-sm" onClick={saveCurrentFile} title="Save (Ctrl+S)">💾</button>
          <button className="icon-btn-sm" onClick={function() { setShowSettingsModal(true); }} title="Settings">⚙️</button>
        </div>
      </header>

      {/* ── MAIN WORKBENCH ── */}
      <div className="nexus-workbench">
        {/* Activity Bar */}
        <aside className="activity-bar">
          <button
            className={"activity-btn " + (activeView === 'explorer' ? 'active' : '')}
            onClick={function() { setActiveView('explorer'); }}
            title="Explorer"
          >
            📁
          </button>
          <button
            className={"activity-btn " + (activeView === 'search' ? 'active' : '')}
            onClick={function() { setActiveView('search'); }}
            title="Search Workspace"
          >
            🔍
          </button>
          <button
            className={"activity-btn " + (activeView === 'git' ? 'active' : '')}
            onClick={function() { setActiveView('git'); loadGitStatus(); }}
            title="Source Control"
          >
            🌿
          </button>
          <button
            className={"activity-btn " + (activeView === 'experience' ? 'active' : '')}
            onClick={function() { setActiveView('experience'); loadExperiences(); }}
            title="NexusAI Experience Network"
          >
            🌐
          </button>

          <div className="activity-bottom">
            <button className="activity-btn" onClick={function() { setShowSettingsModal(true); }} title="Settings">⚙️</button>
          </div>
        </aside>

        {/* Sidebar Drawer */}
        <div className="workbench-sidebar">
          {activeView === 'explorer' && (
            <React.Fragment>
              <div className="sidebar-header">
                <span>Explorer</span>
                <div className="sidebar-actions">
                  <button className="icon-btn-sm" onClick={loadWorkspaceTree} title="Refresh">🔄</button>
                </div>
              </div>
              <div className="sidebar-content">
                {renderTree(fileTree)}
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
                        <span style={{ color: 'var(--accent-cyan)' }}>{res.file}:{res.line}</span>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{res.content}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </React.Fragment>
          )}

          {activeView === 'git' && (
            <React.Fragment>
              <div className="sidebar-header">Source Control</div>
              <div className="sidebar-content">
                <div style={{ fontSize: 12, marginBottom: 8, color: 'var(--accent-cyan)' }}>
                  Branch: {gitStatus.branch || 'main'}
                </div>
                <input
                  className="form-control"
                  placeholder="Commit message..."
                  value={commitMsg}
                  onChange={function(e) { setCommitMsg(e.target.value); }}
                />
                <button className="btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={handleCommit}>
                  Commit Changes
                </button>
                <div style={{ marginTop: 14, fontSize: 12, fontWeight: 600 }}>Changes:</div>
                {gitStatus.changes && gitStatus.changes.map(function(c, i) {
                  return (
                    <div key={i} className="tree-node">
                      <span style={{ color: 'var(--warning)', fontWeight: 'bold' }}>{c.status}</span>
                      <span>{c.path}</span>
                    </div>
                  );
                })}
              </div>
            </React.Fragment>
          )}

          {activeView === 'experience' && (
            <React.Fragment>
              <div className="sidebar-header">NexusAI Network</div>
              <div className="sidebar-content">
                <input
                  className="form-control"
                  placeholder="Search experiences..."
                  value={expSearch}
                  onChange={function(e) { setExpSearch(e.target.value); }}
                  onKeyDown={function(e) { if (e.key === 'Enter') loadExperiences(); }}
                />
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {experiences.map(function(exp) {
                    return (
                      <div key={exp.id} className="agent-card">
                        <div className="agent-card-header">✓ {exp.title}</div>
                        <p style={{ color: 'var(--text-muted)', fontSize: 11 }}>{exp.problem}</p>
                        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--accent-cyan)' }}>
                          Solution: {exp.solution}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </React.Fragment>
          )}
        </div>

        {/* Center Main Editor + Split Preview */}
        <div className="workbench-center">
          {/* Editor Tabs */}
          <div className="editor-tabs">
            {openTabs.map(function(tab) {
              return (
                <div
                  key={tab.path}
                  className={"tab-item " + (activeTabPath === tab.path ? "active" : "")}
                  onClick={function() { setActiveTabPath(tab.path); }}
                >
                  <span>{tab.name} {tab.dirty ? '•' : ''}</span>
                  <span className="tab-close" onClick={function(e) { closeTab(e, tab.path); }}>×</span>
                </div>
              );
            })}
          </div>

          {/* Monaco & Live Preview Panes */}
          <div className="editor-workspace-view">
            <div ref={editorContainerRef} className="monaco-container"></div>

            {showPreview && (
              <div className="preview-split-pane">
                <div className="preview-bar">
                  <span>Live Preview (/sandbox/index.html)</span>
                  <button className="icon-btn-sm" onClick={refreshPreview} title="Refresh">🔄</button>
                </div>
                <iframe ref={previewIframeRef} className="preview-iframe" src="/sandbox/index.html"></iframe>
              </div>
            )}
          </div>

          {/* Bottom Panel (Terminal & Logs) */}
          <div className="bottom-panel">
            <div className="bottom-panel-tabs">
              <span className={"bottom-tab " + (bottomTab === 'terminal' ? 'active' : '')} onClick={function() { setBottomTab('terminal'); }}>Integrated Terminal</span>
              <span className={"bottom-tab " + (bottomTab === 'agent_logs' ? 'active' : '')} onClick={function() { setBottomTab('agent_logs'); }}>Agent Output</span>
            </div>
            <div className="bottom-panel-content">
              {bottomTab === 'terminal' && (
                <div>
                  {terminalLogs.map(function(log, idx) {
                    return <div key={idx}>{log}</div>;
                  })}
                  <div style={{ display: 'flex', alignItems: 'center', marginTop: 6 }}>
                    <span style={{ color: 'var(--accent-cyan)', marginRight: 6 }}>$</span>
                    <input
                      style={{ background: 'transparent', border: 'none', color: '#fff', outline: 'none', flex: 1, fontFamily: 'var(--font-mono)' }}
                      value={terminalInput}
                      onChange={function(e) { setTerminalInput(e.target.value); }}
                      onKeyDown={runTerminalCmd}
                      placeholder="Type command and press Enter..."
                    />
                  </div>
                </div>
              )}
              {bottomTab === 'agent_logs' && (
                <div>
                  {agentEvents.map(function(ev, idx) {
                    return <div key={idx}>[{ev.time}] {ev.text}</div>;
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* AI Agent Right Panel */}
        <aside className="workbench-agent-panel">
          <div className="agent-panel-header">
            <span>NexusAI Autonomous Agent</span>
            {agentRunning && <span style={{ color: 'var(--warning)', fontSize: 11 }}>● Executing</span>}
          </div>

          <div className="agent-timeline">
            {currentPlan && (
              <div className="agent-card">
                <div className="agent-card-header">📋 Implementation Plan</div>
                <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--text-muted)', fontSize: 11 }}>{currentPlan}</pre>
              </div>
            )}

            {agentEvents.map(function(ev, idx) {
              return (
                <div key={idx} className="agent-card">
                  <div className="agent-card-header">
                    {ev.type === 'file' && '📄 '}
                    {ev.type === 'step' && '⚡ '}
                    {ev.type === 'build' && (ev.passed ? '✓ ' : '✗ ')}
                    {ev.type === 'done' && '🎉 '}
                    {ev.text}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{ev.time}</div>
                </div>
              );
            })}
          </div>

          <div className="agent-prompt-box">
            <textarea
              className="agent-input"
              rows={3}
              placeholder="Ask NexusAI agent to build features, fix bugs, or run tests..."
              value={agentPrompt}
              onChange={function(e) { setAgentPrompt(e.target.value); }}
              onKeyDown={function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAgentSubmit(); } }}
            ></textarea>
            <button className="agent-btn-submit" onClick={handleAgentSubmit} disabled={agentRunning}>
              {agentRunning ? 'Building Application...' : 'Run Autonomous Agent'}
            </button>
          </div>
        </aside>
      </div>

      {/* ── SETTINGS MODAL ── */}
      {showSettingsModal && (
        <div className="modal-overlay" onClick={function() { setShowSettingsModal(false); }}>
          <div className="modal-card" onClick={function(e) { e.stopPropagation(); }}>
            <div className="modal-header">
              <span>Settings & LLM Configuration</span>
              <button className="tab-close" onClick={function() { setShowSettingsModal(false); }}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>AI Provider Runtime</label>
                <select
                  className="form-control"
                  value={settings.ai.provider_name}
                  onChange={function(e) {
                    var val = e.target.value;
                    var base = val === 'OpenRouter' ? 'https://openrouter.ai/api/v1' : (val === 'Ollama' ? 'http://localhost:11434/v1' : 'https://api.openai.com/v1');
                    setSettings(Object.assign({}, settings, { ai: Object.assign({}, settings.ai, { provider_name: val, base_url: base }) }));
                  }}
                >
                  <option value="OpenRouter">OpenRouter (Cloud API)</option>
                  <option value="OpenAI">OpenAI Compatible (Cloud)</option>
                  <option value="Ollama">Ollama (Local LLM)</option>
                  <option value="LMStudio">LM Studio (Local LLM)</option>
                  <option value="Custom">Custom Endpoint</option>
                </select>
              </div>

              <div className="form-group">
                <label>Base URL Endpoint</label>
                <input
                  className="form-control"
                  value={settings.ai.base_url}
                  onChange={function(e) {
                    var v = e.target.value;
                    setSettings(Object.assign({}, settings, { ai: Object.assign({}, settings.ai, { base_url: v }) }));
                  }}
                />
              </div>

              <div className="form-group">
                <label>API Key (Cloud only - stored securely)</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="sk-..."
                  value={settings.ai.api_key || ''}
                  onChange={function(e) {
                    var k = e.target.value;
                    setSettings(Object.assign({}, settings, { ai: Object.assign({}, settings.ai, { api_key: k }) }));
                  }}
                />
              </div>

              <div className="form-group">
                <label>Model Name</label>
                <input
                  className="form-control"
                  value={settings.ai.model}
                  onChange={function(e) {
                    var m = e.target.value;
                    setSettings(Object.assign({}, settings, { ai: Object.assign({}, settings.ai, { model: m }) }));
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button className="btn-secondary" onClick={testLLM}>Test Connection</button>
                <button className="btn-primary" onClick={saveSettingsConfig}>Save Settings</button>
              </div>

              {testResult && (
                <div style={{ marginTop: 10, padding: 10, borderRadius: 6, background: testResult.success ? '#064e3b' : '#7f1d1d', color: '#fff', fontSize: 12 }}>
                  {testResult.loading ? 'Testing endpoint...' : (testResult.success ? '✓ ' + testResult.message : '✗ ' + testResult.message + ' (' + testResult.hint + ')')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── PROJECT CREATION MODAL ── */}
      {showNewProjectModal && (
        <div className="modal-overlay" onClick={function() { setShowNewProjectModal(false); }}>
          <div className="modal-card" onClick={function(e) { e.stopPropagation(); }}>
            <div className="modal-header">
              <span>Create / Open Project</span>
              <button className="tab-close" onClick={function() { setShowNewProjectModal(false); }}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Project Name</label>
                <input id="new-proj-name" className="form-control" placeholder="my-awesome-app" defaultValue="nexus-app" />
              </div>
              <div className="form-group">
                <label>Template</label>
                <select id="new-proj-template" className="form-control" defaultValue="vanilla">
                  <option value="vanilla">Vanilla HTML/CSS/JS</option>
                  <option value="react">React + Vite</option>
                  <option value="python">Python FastAPI Backend</option>
                  <option value="node">Node.js</option>
                  <option value="empty">Empty Project</option>
                </select>
              </div>
              <button
                className="btn-primary"
                onClick={function() {
                  var name = document.getElementById('new-proj-name').value;
                  var template = document.getElementById('new-proj-template').value;
                  fetch('/api/project/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name, template: template })
                  })
                  .then(function(r) { return r.json(); })
                  .then(function(d) {
                    setActiveProject(d);
                    setShowNewProjectModal(false);
                    loadWorkspaceTree();
                    refreshPreview();
                  });
                }}
              >
                Create & Open Project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FIRST-RUN ONBOARDING WIZARD ── */}
      {!settings.ai.api_key && settings.ai.provider_name === 'OpenRouter' && !localStorage.getItem('nexus_onboarded') && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <span>🚀 Welcome to NexusAI Studio</span>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                Your autonomous AI developer environment. Choose how you want to run your model to begin:
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
                <div
                  className="agent-card"
                  style={{ cursor: 'pointer', border: settings.ai.provider_type === 'cloud' ? '1px solid var(--accent-cyan)' : '1px solid var(--border-color)' }}
                  onClick={function() {
                    setSettings(Object.assign({}, settings, {
                      ai: Object.assign({}, settings.ai, {
                        provider_type: 'cloud',
                        provider_name: 'OpenRouter',
                        base_url: 'https://openrouter.ai/api/v1'
                      })
                    }));
                  }}
                >
                  <div className="agent-card-header">☁️ Cloud API</div>
                  <p style={{ fontSize: 11, color: 'var(--text-dim)' }}>OpenRouter, DeepSeek, Anthropic, Custom endpoints</p>
                </div>
                <div
                  className="agent-card"
                  style={{ cursor: 'pointer', border: settings.ai.provider_type === 'local' ? '1px solid var(--accent-cyan)' : '1px solid var(--border-color)' }}
                  onClick={function() {
                    setSettings(Object.assign({}, settings, {
                      ai: Object.assign({}, settings.ai, {
                        provider_type: 'local',
                        provider_name: 'Ollama',
                        base_url: 'http://localhost:11434/v1',
                        model: 'qwen2.5-coder:latest'
                      })
                    }));
                  }}
                >
                  <div className="agent-card-header">💻 Local LLM</div>
                  <p style={{ fontSize: 11, color: 'var(--text-dim)' }}>Ollama, LM Studio, vLLM (Private & Offline)</p>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: 8 }}>
                <label>API Endpoint / Base URL</label>
                <input
                  className="form-control"
                  value={settings.ai.base_url}
                  onChange={function(e) {
                    var v = e.target.value;
                    setSettings(Object.assign({}, settings, { ai: Object.assign({}, settings.ai, { base_url: v }) }));
                  }}
                />
              </div>

              {settings.ai.provider_type === 'cloud' && (
                <div className="form-group">
                  <label>API Key</label>
                  <input
                    type="password"
                    className="form-control"
                    placeholder="Enter API key..."
                    value={settings.ai.api_key || ''}
                    onChange={function(e) {
                      var k = e.target.value;
                      setSettings(Object.assign({}, settings, { ai: Object.assign({}, settings.ai, { api_key: k }) }));
                    }}
                  />
                </div>
              )}

              <div className="form-group">
                <label>Model</label>
                <input
                  className="form-control"
                  value={settings.ai.model}
                  onChange={function(e) {
                    var m = e.target.value;
                    setSettings(Object.assign({}, settings, { ai: Object.assign({}, settings.ai, { model: m }) }));
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button className="btn-secondary" onClick={testLLM}>Test Connection</button>
                <button
                  className="btn-primary"
                  onClick={function() {
                    saveSettingsConfig();
                    localStorage.setItem('nexus_onboarded', 'true');
                  }}
                >
                  Get Started & Enter Studio
                </button>
              </div>

              {testResult && (
                <div style={{ marginTop: 8, padding: 8, borderRadius: 6, background: testResult.success ? '#064e3b' : '#7f1d1d', color: '#fff', fontSize: 11 }}>
                  {testResult.loading ? 'Testing...' : (testResult.success ? '✓ ' + testResult.message : '✗ ' + testResult.message)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<NexusStudioApp />);
