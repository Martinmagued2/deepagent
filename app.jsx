/* NexusAI — Main application (React + Babel Standalone) */
/* eslint-disable */

var useState  = React.useState;
var useEffect = React.useEffect;
var useRef    = React.useRef;
var useCallback = React.useCallback;

// ── Activity steps ───────────────────────────────────────────
var STEPS = [
  { id: 'understand', label: 'Understanding request'         },
  { id: 'plan',       label: 'Planning application structure' },
  { id: 'scaffold',   label: 'Creating project files'         },
  { id: 'html',       label: 'Writing HTML structure'         },
  { id: 'css',        label: 'Applying styles & layout'       },
  { id: 'js',         label: 'Implementing interactions'      },
  { id: 'test',       label: 'Running automated tests'        },
  { id: 'check',      label: 'Verifying browser rendering'    },
  { id: 'done',       label: 'Build complete'                 },
];

// ── Pick fallback template ────────────────────────────────────
function pickTemplate(prompt) {
  var t = window.NEXUS_TEMPLATES;
  if (!t) return '';
  var lc = prompt.toLowerCase();
  if (lc.indexOf('expense') >= 0 || lc.indexOf('budget') >= 0 || lc.indexOf('finance') >= 0) return t.expense;
  if (lc.indexOf('kanban') >= 0 || lc.indexOf('board') >= 0 || lc.indexOf('task') >= 0 || lc.indexOf('todo') >= 0) return t.kanban;
  if (lc.indexOf('timer') >= 0 || lc.indexOf('clock') >= 0 || lc.indexOf('stopwatch') >= 0) return t.timer;
  return t.generic(prompt);
}

// ── Simple syntax colorizer ─
function colorize(code) {
  if (!code) return '';
  return code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/("[^"]*")/g, '<span class="tok-str">$1</span>')
    .replace(/\b(function|const|let|var|return|if|else|for|while|class|new)\b/g, '<span class="tok-kw">$1</span>')
    .replace(/(\/\/.*)/g, '<span class="tok-cmt">$1</span>');
}

// ── Icons ─────────────────────────────────────────────────────
function IcoArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7"/>
    </svg>
  );
}
function IcoRefresh() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>
    </svg>
  );
}
function IcoOpen() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    </svg>
  );
}
function IcoCopy() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
    </svg>
  );
}
function IcoDownload() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>
    </svg>
  );
}
function IcoEdit() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
    </svg>
  );
}
function IcoCheck() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}
function IcoShield() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// SCREEN 1 — PROMPT
// ─────────────────────────────────────────────────────────────
function PromptScreen({ onSubmit }) {
  var ref = useRef(null);
  var state = useState('');
  var value = state[0];
  var setValue = state[1];

  useEffect(function() {
    if (ref.current) ref.current.focus();
  }, []);

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) onSubmit(value.trim());
    }
  }

  return (
    <div className="screen-prompt">
      <div className="prompt-page-inner">
        <div className="prompt-brand">
          <div className="prompt-brand-mark">N</div>
          <div className="prompt-brand-name">NexusAI</div>
        </div>

        <h1 className="prompt-headline">
          What do you want<br />
          <span>to build?</span>
        </h1>

        <div className="prompt-card">
          <textarea
            ref={ref}
            id="main-prompt-input"
            className="prompt-textarea"
            placeholder="Describe anything — an app, dashboard, tool, game, form..."
            value={value}
            rows={5}
            onChange={function(e) { setValue(e.target.value); }}
            onKeyDown={handleKey}
          />
          <div className="prompt-card-footer">
            <span className="prompt-hint">Enter to build &nbsp;·&nbsp; Shift+Enter for new line</span>
            <button
              id="prompt-submit-btn"
              className="prompt-submit-btn"
              disabled={!value.trim()}
              onClick={function() { if (value.trim()) onSubmit(value.trim()); }}
            >
              <span>Build it</span>
              <IcoArrow />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ACTIVITY PANEL (shows steps + live agent reasoning feed)
// ─────────────────────────────────────────────────────────────
function ActivityPanel({ activeIdx, liveLogs }) {
  var logsRef = useRef(null);
  var tabState = useState('terminal'); // 'terminal' or 'steps'
  var activeTab = tabState[0];
  var setActiveTab = tabState[1];

  useEffect(function() {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [liveLogs, activeTab]);

  return (
    <div className="panel panel-activity">
      <div className="panel-header">
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span className="panel-title">Console & Activity</span>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            className={'btn-ghost ' + (activeTab === 'terminal' ? 'active' : '')}
            style={{ padding: '2px 8px', fontSize: '0.7rem', background: activeTab === 'terminal' ? 'var(--bg-2)' : 'transparent' }}
            onClick={function() { setActiveTab('terminal'); }}
          >
            Console
          </button>
          <button
            className={'btn-ghost ' + (activeTab === 'steps' ? 'active' : '')}
            style={{ padding: '2px 8px', fontSize: '0.7rem', background: activeTab === 'steps' ? 'var(--bg-2)' : 'transparent' }}
            onClick={function() { setActiveTab('steps'); }}
          >
            Steps
          </button>
        </div>
      </div>

      {activeTab === 'steps' ? (
        <div className="activity-feed">
          {STEPS.map(function(step, i) {
            var state = i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'pending';
            return (
              <div key={step.id} className={'activity-item ' + state}>
                <div className={'activity-icon ' + (state === 'done' ? 'done-icon' : state === 'active' ? 'active-icon' : 'pending')}>
                  {state === 'done'   ? <IcoCheck /> : null}
                  {state === 'active' ? <div className="spin-ring" /> : null}
                </div>
                <span className="activity-label">{step.label}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="activity-terminal" style={{ margin: 0, border: 'none', borderRadius: 0, height: '100%' }}>
          <div className="activity-terminal-header">
            <span>TERMINAL OUTPUT</span>
            <span style={{ color: 'var(--green)' }}>● LIVE</span>
          </div>
          <div className="activity-terminal-body" ref={logsRef}>
            {(!liveLogs || liveLogs.length === 0) ? (
              <div style={{ color: 'var(--text-3)' }}>Waiting for build execution...</div>
            ) : (
              liveLogs.map(function(log, idx) {
                var cls = 'terminal-line';
                if (log.type === 'terminal_banner' || log.type === 'agent_started') cls += ' banner';
                else if (log.type === 'build_success') cls += ' success';
                else if (log.type === 'command_error') cls += ' fail';
                else if (log.type === 'tool_call_start' || log.type === 'tool_call_end') cls += ' tool';
                else if (log.type === 'command_running' || log.type === 'file_written') cls += ' cmd';
                return (
                  <div key={idx} className={cls}>
                    {log.text || log.message}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CODE PANEL
// ─────────────────────────────────────────────────────────────
function CodePanel({ files, activeFile, onSelect, onCopy, onDownload }) {
  var fileNames = Object.keys(files || {});
  var code   = (files && files[activeFile]) || '';
  var lines  = code.split('\n');
  var html   = colorize(code);

  return (
    <div className="panel panel-code">
      <div className="panel-header">
        <span className="panel-title">Code</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button className="btn-icon" title="Copy" id="code-copy-btn" onClick={onCopy}><IcoCopy /></button>
          <button className="btn-icon" title="Download" id="code-dl-btn" onClick={onDownload}><IcoDownload /></button>
        </div>
      </div>

      <div className="file-tree">
        <div className="file-tree-label">Files ({fileNames.length})</div>
        {fileNames.map(function(f) {
          return (
            <div
              key={f}
              className={'file-item ' + (activeFile === f ? 'active' : '')}
              onClick={function() { onSelect(f); }}
            >
              <div className="file-dot" />
              {f}
            </div>
          );
        })}
      </div>

      <div className="code-editor-area">
        <div className="line-numbers">
          {lines.map(function(_, i) { return <div key={i}>{i + 1}</div>; })}
        </div>
        <div
          className="code-content"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PREVIEW PANEL
// ─────────────────────────────────────────────────────────────
function PreviewPanel({ html, slug }) {
  var iframeRef = useRef(null);

  // When html changes we just reload the iframe by bumping the src timestamp.
  // The server already serves sandbox_app/ at /sandbox/ so all relative
  // imports (style.css, script.js) resolve correctly — no srcdoc needed.
  useEffect(function() {
    if (iframeRef.current && html) {
      // Force reload by toggling src with a cache-buster
      iframeRef.current.src = '/sandbox/index.html?t=' + Date.now();
    }
  }, [html]);


  function refresh() {
    if (!iframeRef.current || !html) return;
    iframeRef.current.src = '/sandbox/index.html?t=' + Date.now();
  }


  function openTab() {
    if (!html) return;
    var blob = new Blob([html], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  }

  return (
    <div className="panel panel-preview">
      <div className="panel-header">
        <span className="panel-title">Live Preview</span>
        <div className="preview-toolbar">
          <div className="preview-url">
            <IcoShield />
            <span className="preview-url-text">
              {html ? ('preview.nexus/' + (slug || 'app')) : 'waiting for build...'}
            </span>
          </div>
          <button className="btn-icon" title="Refresh" id="preview-refresh-btn" onClick={refresh}><IcoRefresh /></button>
          <button className="btn-icon" title="Open in tab" id="preview-open-btn" onClick={openTab}><IcoOpen /></button>
        </div>
      </div>

      <div className={'preview-frame-container' + (!html ? ' dark-bg' : '')}>
        {!html ? (
          <div className="preview-placeholder">
            <div className="preview-placeholder-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect width="18" height="18" x="3" y="3" rx="2"/>
                <circle cx="9" cy="9" r="2"/>
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
              </svg>
            </div>
            <p>Live preview will appear as soon as the agent builds the app</p>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            id="preview-iframe"
            className="preview-iframe"
            title="Live Preview"
            src="/sandbox/index.html"
            sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
          />

        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// WORKSPACE SCREEN
// ─────────────────────────────────────────────────────────────
function WorkspaceScreen({ prompt, onNewBuild }) {
  var stepState    = useState(0);
  var activeStep   = stepState[0];
  var setActiveStep = stepState[1];

  var statusState  = useState('building');
  var buildStatus  = statusState[0];
  var setBuildStatus = statusState[1];

  var htmlState    = useState(null);
  var previewHtml  = htmlState[0];
  var setPreviewHtml = htmlState[1];

  var filesState   = useState({ 'index.html': '' });
  var files        = filesState[0];
  var setFiles     = filesState[1];

  var fileState    = useState('index.html');
  var activeFile   = fileState[0];
  var setActiveFile = fileState[1];

  var editState    = useState(false);
  var editOpen     = editState[0];
  var setEditOpen  = editState[1];

  var editValState = useState(prompt);
  var editValue    = editValState[0];
  var setEditValue = editValState[1];

  var logsState    = useState([]);
  var liveLogs     = logsState[0];
  var setLiveLogs  = logsState[1];

  // Panel sizes (percentages)
  var sizesState   = useState({ left: 22, middle: 36 });
  var sizes        = sizesState[0];
  var setSizes     = sizesState[1];

  var containerRef = useRef(null);
  var dragging     = useRef(null);
  var dragStartX   = useRef(0);
  var dragStartSz  = useRef(null);

  // Resize mouse events
  useEffect(function() {
    function onMove(e) {
      if (!dragging.current || !containerRef.current) return;
      var cw = containerRef.current.offsetWidth;
      var dx = ((e.clientX - dragStartX.current) / cw) * 100;
      setSizes(function(prev) {
        var s = { left: prev.left, middle: prev.middle };
        if (dragging.current === 'left') {
          s.left = Math.max(14, Math.min(40, dragStartSz.current.left + dx));
        } else {
          s.middle = Math.max(18, Math.min(55, dragStartSz.current.middle + dx));
        }
        return s;
      });
    }
    function onUp() {
      dragging.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return function() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  function startDrag(handle) {
    return function(e) {
      e.preventDefault();
      dragging.current = handle;
      dragStartX.current = e.clientX;
      dragStartSz.current = { left: sizes.left, middle: sizes.middle };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    };
  }

  // REAL AGENT EXECUTION & WEBSOCKET SYNC
  useEffect(function() {
    var cancelled = false;
    var ws = null;
    var timerInterval = null;

    // Connect WebSocket for live logs and real reasoning tracking
    try {
      var wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      var wsUrl = wsProtocol + '//' + window.location.host + '/ws/logs';
      ws = new WebSocket(wsUrl);

      ws.onmessage = function(event) {
        if (cancelled) return;
        try {
          var data = JSON.parse(event.data);
          setLiveLogs(function(prev) {
            return prev.concat([data]).slice(-40);
          });

          // Match AI agent's actual actions to the UI steps
          if (data.type === 'agent_started') {
            setActiveStep(0); // Understanding request
          } else if (data.type === 'reasoning_step') {
            setActiveStep(1); // Planning application structure
          } else if (data.type === 'tool_call_start') {
            if (data.data && data.data.tool === 'list_files') {
              setActiveStep(2); // Creating project files
            } else if (data.data && data.data.tool === 'write_file') {
              var inputStr = data.data.input || '';
              if (inputStr.indexOf('index.html') >= 0) {
                setActiveStep(3); // Writing HTML structure
              } else if (inputStr.indexOf('.css') >= 0) {
                setActiveStep(4); // Applying styles & layout
              } else if (inputStr.indexOf('.js') >= 0) {
                setActiveStep(5); // Implementing interactions
              }
            } else if (data.data && data.data.tool === 'run_command') {
              setActiveStep(6); // Running automated tests
            }
          } else if (data.type === 'file_written' && data.data) {
            var fname = data.data.filename;
            var content = data.data.content;
            if (fname && content) {
              setFiles(function(prev) {
                var next = Object.assign({}, prev);
                next[fname] = content;
                return next;
              });
              if (fname === 'index.html') {
                setActiveStep(7); // Verifying browser rendering
              }
            }
          } else if (data.type === 'agent_finished') {
            setActiveStep(STEPS.length); // Build complete
            setBuildStatus('ready');
          }
        } catch (e) {
          // ignore json parse error
        }
      };
    } catch (e) {
      console.warn('WebSocket setup warning:', e);
    }

    // Step pacing: In case the LLM takes time thinking without tool events,
    // progress steps calmly and deliberately (4-6 seconds each) rather than flashing instantly
    var currentPaceStep = 0;
    timerInterval = setInterval(function() {
      if (cancelled) return;
      currentPaceStep++;
      if (currentPaceStep <= 2) {
        setActiveStep(function(prev) { return Math.max(prev, currentPaceStep); });
      }
    }, 4500);

    // Call the actual AI Agent backend
    fetch('/api/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt })
    }).then(function(res) {
      if (!res.ok) throw new Error('Build failed');
      return res.json();
    }).then(function(data) {
      if (cancelled) return;
      clearInterval(timerInterval);

      var htmlContent = data.html;
      var fileDict = data.files || {};

      if (!htmlContent && (!fileDict || Object.keys(fileDict).length === 0)) {
        // Fallback if backend returned empty
        htmlContent = pickTemplate(prompt);
        fileDict = { 'index.html': htmlContent };
      }

      setFiles(fileDict);
      var defaultFile = fileDict['index.html'] ? 'index.html' : Object.keys(fileDict)[0] || 'index.html';
      setActiveFile(defaultFile);
      setPreviewHtml(htmlContent || fileDict['index.html'] || '');
      setActiveStep(STEPS.length);
      setBuildStatus('ready');
    }).catch(function(err) {
      if (cancelled) return;
      clearInterval(timerInterval);
      console.warn('Backend build error, loading template fallback:', err);
      var fallbackHtml = pickTemplate(prompt);
      setFiles({ 'index.html': fallbackHtml });
      setPreviewHtml(fallbackHtml);
      setActiveStep(STEPS.length);
      setBuildStatus('ready');
    });

    return function() {
      cancelled = true;
      if (timerInterval) clearInterval(timerInterval);
      if (ws) ws.close();
    };
  }, [prompt]);

  // Slug from prompt
  var slug = prompt.slice(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  function copyCode() {
    var code = files[activeFile] || '';
    if (navigator.clipboard) navigator.clipboard.writeText(code).catch(function(){});
  }

  function downloadCode() {
    var code = files[activeFile] || '';
    var blob = new Blob([code], { type: 'text/plain' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href   = url;
    a.download = activeFile;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportApp() {
    if (!previewHtml) return;
    var blob = new Blob([previewHtml], { type: 'text/html' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href   = url;
    a.download = slug + '.html';
    a.click();
    URL.revokeObjectURL(url);
  }

  function submitEdit() {
    var v = editValue.trim();
    setEditOpen(false);
    if (v && v !== prompt) onNewBuild(v);
  }

  var statusLabel = buildStatus === 'building' ? 'Building...' : buildStatus === 'ready' ? 'Ready' : 'Error';

  return (
    <div className="screen-workspace">

      {/* ── HEADER ─────────────────────────────────────────── */}
      <header className="ws-header">
        <div className="ws-header-left">
          <a
            href="#"
            className="ws-logo"
            onClick={function(e) { e.preventDefault(); onNewBuild(null); }}
          >
            <div className="ws-logo-mark">N</div>
            <span className="ws-logo-name">NexusAI</span>
          </a>
          <div className="ws-sep" />
          <span className="ws-project-name">{slug}</span>
          <div className={'ws-status ' + buildStatus}>
            <div className="ws-status-dot" />
            {statusLabel}
          </div>
        </div>
        <div className="ws-header-right">
          <button className="btn-ghost" id="new-build-btn" onClick={function() { onNewBuild(null); }}>
            New build
          </button>
          {previewHtml && (
            <button className="btn-solid" id="export-btn" onClick={exportApp}>
              <IcoDownload />
              Export
            </button>
          )}
        </div>
      </header>

      {/* ── REQUEST BAR ────────────────────────────────────── */}
      <div className="ws-request-bar">
        <p className="ws-request-text">
          <strong>Build: </strong>{prompt}
        </p>
        <button className="btn-ghost" id="edit-request-btn" onClick={function() { setEditOpen(true); }} style={{ flexShrink: 0 }}>
          <IcoEdit />
          Edit
        </button>
      </div>

      {/* ── THREE PANELS ───────────────────────────────────── */}
      <div className="ws-body" ref={containerRef}>

        {/* Left — Activity & Live Logs */}
        <div style={{ width: sizes.left + '%', display: 'flex', overflow: 'hidden', flexShrink: 0 }}>
          <ActivityPanel activeIdx={activeStep} liveLogs={liveLogs} />
        </div>

        {/* Drag handle 1 */}
        <div
          className="resize-handle"
          id="resize-left"
          onMouseDown={startDrag('left')}
        />

        {/* Middle — Code */}
        <div style={{ width: sizes.middle + '%', display: 'flex', overflow: 'hidden', flexShrink: 0 }}>
          <CodePanel
            files={files}
            activeFile={activeFile}
            onSelect={setActiveFile}
            onCopy={copyCode}
            onDownload={downloadCode}
          />
        </div>

        {/* Drag handle 2 */}
        <div
          className="resize-handle"
          id="resize-right"
          onMouseDown={startDrag('right')}
        />

        {/* Right — Preview */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: '220px' }}>
          <PreviewPanel html={previewHtml} slug={slug} />
        </div>
      </div>

      {/* ── EDIT MODAL ─────────────────────────────────────── */}
      {editOpen && (
        <div className="edit-request-modal" onClick={function() { setEditOpen(false); }}>
          <div className="edit-request-dialog" onClick={function(e) { e.stopPropagation(); }}>
            <h3>Edit your request</h3>
            <textarea
              id="edit-request-textarea"
              className="edit-request-textarea"
              value={editValue}
              autoFocus
              rows={4}
              onChange={function(e) { setEditValue(e.target.value); }}
              onKeyDown={function(e) {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit(); }
                if (e.key === 'Escape') setEditOpen(false);
              }}
            />
            <div className="edit-request-actions">
              <button className="btn-ghost" onClick={function() { setEditOpen(false); }}>Cancel</button>
              <button className="btn-solid" id="edit-submit-btn" onClick={submitEdit}>Rebuild</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────
function App() {
  var screenState = useState('prompt');
  var screen      = screenState[0];
  var setScreen   = screenState[1];

  var promptState = useState('');
  var prompt      = promptState[0];
  var setPrompt   = promptState[1];

  var keyState    = useState(0);
  var buildKey    = keyState[0];
  var setBuildKey = keyState[1];

  function handleSubmit(p) {
    setPrompt(p);
    setScreen('workspace');
    setBuildKey(function(k) { return k + 1; });
  }

  function handleNewBuild(p) {
    if (p) {
      setPrompt(p);
      setBuildKey(function(k) { return k + 1; });
    } else {
      setScreen('prompt');
      setPrompt('');
    }
  }

  if (screen === 'workspace' && prompt) {
    return <WorkspaceScreen key={buildKey} prompt={prompt} onNewBuild={handleNewBuild} />;
  }

  return <PromptScreen onSubmit={handleSubmit} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
