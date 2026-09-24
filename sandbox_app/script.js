// ============================================
// SmartStudy - Full Application Logic
// ============================================

// --- State Management ---
const STORAGE_KEY_COURSES = 'smartstudy_courses';
const STORAGE_KEY_TASKS = 'smartstudy_tasks';

let courses = [];
let tasks = [];
let currentView = 'dashboard';
let activeFilter = 'all';
let activePriority = 'all';
let currentDate = new Date();
let selectedColor = '#6366f1';

// --- Initialization ---
function init() {
    loadFromLocalStorage();
    setupEventListeners();
    renderAll();
}

// --- LocalStorage Helpers ---
function loadFromLocalStorage() {
    try {
        const savedCourses = localStorage.getItem(STORAGE_KEY_COURSES);
        const savedTasks = localStorage.getItem(STORAGE_KEY_TASKS);
        
        courses = savedCourses ? JSON.parse(savedCourses) : [];
        tasks = savedTasks ? JSON.parse(savedTasks) : [];
    } catch (e) {
        console.warn('Failed to load data from localStorage:', e);
        courses = [];
        tasks = [];
    }
}

function saveToLocalStorage() {
    try {
        localStorage.setItem(STORAGE_KEY_COURSES, JSON.stringify(courses));
        localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));
    } catch (e) {
        console.error('Failed to save data to localStorage:', e);
    }
}

// --- Event Listeners ---
function setupEventListeners() {
    // Navigation views
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            switch (view) {
                case 'dashboard': currentView = 'dashboard'; renderAll(); break;
                case 'courses': currentView = 'courses'; renderAll(); break;
                case 'calendar': currentView = 'calendar'; renderAll(); break;
                case 'deadlines': currentView = 'deadlines'; renderAll(); break;
            }
        });
    });

    // Clear data button
    document.getElementById('clearDataBtn').addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all courses and tasks? This cannot be undone.')) {
            localStorage.removeItem(STORAGE_KEY_COURSES);
            localStorage.removeItem(STORAGE_KEY_TASKS);
            courses = [];
            tasks = [];
            renderAll();
        }
    });

    // Menu toggle for sidebar
    document.getElementById('menuToggle').addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('open');
        document.getElementById('sidebarOverlay').classList.toggle('active', document.querySelector('.sidebar').classList.contains('open'));
    });

    // Add course modal
    document.getElementById('addCourseBtn').addEventListener('click', () => openCourseModal());
    document.getElementById('closeAddCourseModal').addEventListener('click', () => closeModal('add-course'));
    document.getElementById('saveCourse').addEventListener('click', () => {
        const id = document.getElementById('courseId').value;
        if (id) addCourse(id);
        else addCourse();
    });

    // Add task modal
    document.getElementById('closeAddTaskModal').addEventListener('click', () => closeModal('add-task'));
    document.getElementById('saveTask').addEventListener('click', () => {
        const id = document.getElementById('taskId').value;
        if (id) addTask(id);
        else addTask();
    });

    // Task detail modal
    document.getElementById('closeTaskDetail').addEventListener('click', () => closeModal('task-detail'));

    // Filter changes
    document.getElementById('deadlineFilter').addEventListener('change', () => {
        activeFilter = document.getElementById('deadlineFilter').value;
        renderDeadlines();
    });
    document.getElementById('priorityFilter').addEventListener('change', () => {
        activePriority = document.getElementById('priorityFilter').value;
        renderDeadlines();
    });

    // Calendar navigation
    document.getElementById('prevMonth').addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    });
    document.getElementById('nextMonth').addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    });

    // Modal close on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeModal(overlay.id.replace('Modal', ''));
            }
        });
    });

    // Course color picker
    document.querySelectorAll('.color-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            document.getElementById('courseColor').value = option.dataset.color;
            selectedColor = option.dataset.color;
        });
    });

    // Task type change
    document.getElementById('taskType').addEventListener('change', () => {
        const type = document.getElementById('taskType').value;
        document.getElementById('taskModalTitle').textContent = type === 'exam' ? 'Add New Exam' : 'Add New Assignment';
    });
}

// --- Rendering Functions ---
function renderAll() {
    renderStats();
    renderCoursesGrid();
    renderCalendar();
    renderDeadlines();
    updatePageTitle();
}

function renderStats() {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.completed).length;
    const overdueTasks = tasks.filter(t => t.completed === false && new Date(t.deadline) < new Date()).length;
    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    
    document.getElementById('courseProgressList').innerHTML = generateCourseProgressHtml();
    document.getElementById('recentTasksList').innerHTML = generateRecentTasksHtml();
}

function generateCourseProgressHtml() {
    if (courses.length === 0) return '<p class="text-center text-gray-500 py-8">No courses yet. Add your first course above!</p>';
    
    return courses.map(course => {
        const total = tasks.filter(t => t.courseId === course.id).length;
        const completed = tasks.filter(t => t.courseId === course.id && t.completed).length;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        
        return `
            <div class="course-card">
                <div class="course-header">
                    <div class="course-name">${escapeHtml(course.name)}</div>
                    <span class="course-badge" style="background: ${course.color}">${course.color}</span>
                </div>
                <div class="course-stats">
                    <div class="course-stat"><strong>${total}</strong><span>Total</span></div>
                    <div class="course-stat"><strong>${completed}</strong><span>Completed</span></div>
                    <div class="course-stat"><strong>${pct}%</strong><span>Progress</span></div>
                </div>
                <div class="course-progress-bar">
                    <div class="course-progress-fill" style="width: ${total > 0 ? Math.min(pct, 100) : 0}%"></div>
                </div>
                <div class="course-actions">
                    <button class="btn btn-sm btn-primary" onclick="openTaskModal(${course.id})">+ Add Task</button>
                    <button class="btn btn-sm btn-secondary" onclick="openCourseModal(${course.id})">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteCourse(${course.id})">Delete</button>
                </div>
            </div>`;
    }).join('');
}

function generateRecentTasksHtml() {
    if (tasks.length === 0) return '<p class="text-center text-gray-500 py-8">No tasks yet.</p>';
    
    const recent = [...tasks].reverse().slice(0, 5);
    return recent.map(task => {
        const isOverdue = new Date(task.deadline) < new Date() && !task.completed;
        const today = new Date().toISOString().split('T')[0];
        const dayClass = isOverdue ? 'overdue' : 'upcoming';
        
        return `
            <div class="task-item ${task.completed ? 'completed' : ''}" data-id="${task.id}">
                <input type="checkbox" class="task-checkbox ${task.completed ? 'checked' : ''}" 
                       onchange="toggleTaskCompletion(${task.id})">
                <span class="task-item-title">${escapeHtml(task.title)}</span>
                <span class="task-item-meta">
                    <span class="deadline-priority ${task.priority}">${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}</span>
                    <span class="deadline-badge ${task.type}">${task.type.charAt(0).toUpperCase() + task.type.slice(1)}</span>
                    <span class="deadline-meta">${formatDate(task.deadline)}</span>
                </span>
                <div class="task-actions">
                    <button class="btn btn-sm btn-danger" onclick="deleteTask(${task.id})">✕</button>
                </div>
            </div>`;
    }).join('');
}

// --- Course Operations ---
function addCourse(id) {
    const name = document.getElementById('courseName').value.trim();
    const color = document.getElementById('courseColor').value;
    
    if (!name) {
        alert('Please enter a course name');
        return;
    }
    
    if (id) {
        // Update existing course
        const courseIndex = courses.findIndex(c => c.id === id);
        if (courseIndex !== -1) {
            courses[courseIndex].name = name;
            courses[courseIndex].color = color;
        }
    } else {
        // Add new course
        const newCourse = {
            id: Date.now().toString(),
            name,
            color: color || selectedColor
        };
        courses.push(newCourse);
    }
    
    saveToLocalStorage();
    closeModal('add-course');
    renderAll();
}

function getDefaultColor() {
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
    return colors[Math.floor(Math.random() * colors.length)];
}

function deleteCourse(id) {
    const course = courses.find(c => c.id === id);
    if (confirm(`Delete course "${course?.name || 'Unknown'}"?`)) {
        courses = courses.filter(c => c.id !== id);
        saveToLocalStorage();
        renderAll();
    }
}

function openCourseModal(id) {
    const course = courses.find(c => c.id === id);
    if (!course) return;
    document.getElementById('courseName').value = course.name;
    document.getElementById('courseColor').value = course.color;
    document.getElementById('courseId').value = id;
    document.getElementById('saveCourse').textContent = 'Update Course';
    document.getElementById('addCourseModal').classList.remove('hidden');
}

// --- Task Operations ---
function addTask(id) {
    const title = document.getElementById('taskTitle').value.trim();
    const type = document.getElementById('taskType').value;
    const priority = document.getElementById('taskPriority').value;
    const courseId = document.getElementById('taskCourse').value;
    const deadline = document.getElementById('taskDeadline').value;
    
    if (!title) {
        alert('Please enter a task title');
        return;
    }
    
    if (!deadline) {
        alert('Please select a deadline');
        return;
    }
    
    if (!courseId) {
        alert('Please select a course');
        return;
    }
    
    const taskData = {
        id: id || Date.now().toString(),
        title,
        type,
        priority,
        courseId,
        completed: false,
        deadline,
        createdAt: new Date().toISOString()
    };
    
    if (id) {
        // Update existing task
        const taskIndex = tasks.findIndex(t => t.id === id);
        if (taskIndex !== -1) {
            tasks[taskIndex] = taskData;
        }
    } else {
        // Add new task
        tasks.push(taskData);
    }
    
    saveToLocalStorage();
    closeModal('add-task');
    renderAll();
}

function deleteTask(id) {
    const task = tasks.find(t => t.id === id);
    if (confirm(`Delete task "${task?.title || 'Unknown'}"?`)) {
        tasks = tasks.filter(t => t.id !== id);
        saveToLocalStorage();
        renderAll();
    }
}

function toggleTaskCompletion(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        task.completed = !task.completed;
        saveToLocalStorage();
        renderAll();
    }
}

// --- Modal Helpers ---
function openModal(type) {
    const mod = {
        'add-course': openCourseModal,
        'add-task': openTaskModal,
        'task-detail': openTaskDetailModal
    }[type];
    if (mod) mod();
}

function closeModal(type) {
    if (type === 'add-course') document.getElementById('addCourseModal').classList.add('hidden');
    if (type === 'add-task') document.getElementById('addTaskModal').classList.add('hidden');
    if (type === 'task-detail') document.getElementById('taskDetailModal').classList.add('hidden');
}

// --- Dashboard ---
function renderDashboard() {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.completed).length;
    const overdueTasks = tasks.filter(t => !t.completed && new Date(t.deadline) < new Date()).length;
    
    document.getElementById('courseProgressList').innerHTML = generateCourseProgressHtml();
    document.getElementById('recentTasksList').innerHTML = generateRecentTasksHtml();
    
    // Show quick stats in page title
    document.getElementById('pageTitle').textContent = `Dashboard – ${totalTasks} Total, ${completedTasks} Completed, ${overdueTasks} Overdue`;
}

// --- Calendar ---
function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    
    document.getElementById('calendarMonth').textContent = `${monthNames[month]} ${year}`;
    
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0=Sun, 6=Sat
    
    let calendarHTML = `
        <div class="calendar-header">
            <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
        </div>
        <div class="calendar-grid">
    `;
    
    // Fill empty cells for previous week
    for (let i = 0; i < firstDayOfMonth; i++) {
        calendarHTML += `<div class="calendar-day empty"></div>`;
    }
    
    // Days of current month
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const isToday = date.getTime() === new Date().getTime();
        const isPast = date < new Date();
        const isOtherMonth = date.getMonth() !== month;
        
        const cls = [
            'calendar-day',
            isPast ? 'calendar-day other-month' : '',
            isToday ? 'calendar-day today' : '',
        ].filter(Boolean).join(' ');
        
        calendarHTML += `<div class="${cls}" data-date="${date.toISOString()}">${d}</div>`;
    }
    
    // Next week placeholders
    const weeksLeft = Math.ceil((firstDayOfMonth + 7 - new Date(year, month, 1).getDay()) / 7);
    for (let w = 0; w < weeksLeft; w++) {
        calendarHTML += `<div class="calendar-day empty"></div>`;
    }
    
    calendarHTML += `</div>`;
    
    document.getElementById('calendar').innerHTML = calendarHTML;
    
    // Add tasks to calendar
    setTimeout(() => {
        document.querySelectorAll('.calendar-day').forEach(day => {
            if (day.classList.contains('empty')) return;
            const dateStr = day.dataset.date;
            const tasksForDay = tasks.filter(t => {
                const taskDate = new Date(t.deadline).toDateString();
                return taskDate === new Date(dateStr).toDateString();
            });
            
            if (tasksForDay.length > 0) {
                const taskHtml = tasksForDay.map(t => {
                    const cls = t.completed ? 'calendar-task completed' : 'calendar-task';
                    return `<div class="${cls} ${t.type}" onclick="openTaskDetailModal(${t.id})">${escapeHtml(t.title)}</div>`;
                }).join('');
                day.innerHTML = `<div class="day-number">${day.textContent}</div>${taskHtml}`;
            } else {
                day.innerHTML = `<div class="day-number">${day.textContent}</div>`;
            }
        });
    }, 0);
}

// --- Deadlines ---
function renderDeadlines() {
    const filtered = activeFilter === 'all' 
        ? tasks 
        : tasks.filter(t => t.type === activeFilter);
    
    if (filtered.length === 0) {
        document.getElementById('deadlinesList').innerHTML = '<p class="text-center text-gray-500 py-8">No tasks match this filter.</p>';
        return;
    }
    
    const today = new Date();
    const nextWeek = new Date(today.getTime() + 7 * 86400000);
    
    let deadlinesList = '';
    
    // Overdue tasks
    const overdue = filtered.filter(t => !t.completed && new Date(t.deadline) < today);
    if (overdue.length > 0) {
        deadlinesList += '<div class="deadline-section">Overdue Tasks</div>';
        overdue.forEach(t => {
            const cls = t.priority === 'high' ? 'deadline-badge high' : t.priority === 'medium' ? 'deadline-badge medium' : 'deadline-badge low';
            deadlinesList += `
                <div class="deadline-item overdue" data-id="${t.id}">
                    <span class="deadline-priority ${t.priority}">${t.priority}</span>
                    <span class="deadline-badge ${cls}">${t.type.charAt(0).toUpperCase() + t.type.slice(1)}</span>
                    <span class="deadline-title">${escapeHtml(t.title)}</span>
                    <span class="deadline-meta">${formatDate(t.deadline)}</span>
                    <div class="deadline-actions">
                        <button class="btn btn-sm btn-primary" onclick="openTaskModal(${t.id})">Edit</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteTask(${t.id})">Delete</button>
                    </div>
                </div>`;
        });
    }
    
    // Today tasks
    const todayTasks = filtered.filter(t => new Date(t.deadline).toDateString() === today.toDateString());
    if (todayTasks.length > 0) {
        deadlinesList += '<div class="deadline-section">Tasks Due Today</div>';
        todayTasks.forEach(t => {
            const cls = t.priority === 'high' ? 'deadline-badge high' : t.priority === 'medium' ? 'deadline-badge medium' : 'deadline-badge low';
            deadlinesList += `
                <div class="deadline-item today" data-id="${t.id}">
                    <span class="deadline-priority ${t.priority}">${t.priority}</span>
                    <span class="deadline-badge ${cls}">${t.type.charAt(0).toUpperCase() + t.type.slice(1)}</span>
                    <span class="deadline-title">${escapeHtml(t.title)}</span>
                    <span class="deadline-meta">${formatDate(t.deadline)}</span>
                    <div class="deadline-actions">
                        <button class="btn btn-sm btn-primary" onclick="openTaskModal(${t.id})">Edit</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteTask(${t.id})">Delete</button>
                    </div>
                </div>`;
        });
    }
    
    // Upcoming tasks (within next 7 days)
    const upcoming = filtered.filter(t => {
        const due = new Date(t.deadline);
        return due >= today && due <= nextWeek;
    });
    if (upcoming.length > 0) {
        deadlinesList += '<div class="deadline-section">Upcoming Tasks (Next 7 Days)</div>';
        upcoming.forEach(t => {
            const cls = t.priority === 'high' ? 'deadline-badge high' : t.priority === 'medium' ? 'deadline-badge medium' : 'deadline-badge low';
            deadlinesList += `
                <div class="deadline-item upcoming" data-id="${t.id}">
                    <span class="deadline-priority ${t.priority}">${t.priority}</span>
                    <span class="deadline-badge ${cls}">${t.type.charAt(0).toUpperCase() + t.type.slice(1)}</span>
                    <span class="deadline-title">${escapeHtml(t.title)}</span>
                    <span class="deadline-meta">${formatDate(t.deadline)}</span>
                    <div class="deadline-actions">
                        <button class="btn btn-sm btn-primary" onclick="openTaskModal(${t.id})">Edit</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteTask(${t.id})">Delete</button>
                    </div>
                </div>`;
        });
    }
    
    document.getElementById('deadlinesList').innerHTML = deadlinesList;
}

// --- Task Detail Modal ---
function openTaskDetailModal(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    
    document.getElementById('taskDetailTitle').textContent = task.title;
    document.getElementById('taskDetailBody').innerHTML = `
        <div class="task-details">
            <div class="task-meta">
                <span class="deadline-priority ${task.priority}">${task.priority}</span>
                <span class="deadline-badge ${task.type}">${task.type.charAt(0).toUpperCase() + task.type.slice(1)}</span>
                <span class="deadline-meta">${formatDate(task.deadline)}</span>
            </div>
            <div class="task-description">${escapeHtml(task.title)}</div>
            <div class="task-actions">
                <button class="btn btn-sm btn-primary" onclick="openTaskModal(${id})">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteTask(${id})">Delete</button>
            </div>
        </div>
    `;
    document.getElementById('taskDetailFooter').innerHTML = `
        <div class="task-actions">
            <button class="btn btn-sm btn-primary" onclick="openTaskModal(${id})">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="deleteTask(${id})">Delete</button>
        </div>
    `;
    document.getElementById('taskDetailModal').classList.remove('hidden');
}

// --- Helper Functions ---
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${month}-${day}-${year}`;
}

// --- Key Actions ---
function deleteTask(id) {
    const task = tasks.find(t => t.id === id);
    if (confirm(`Delete task "${task?.title || 'Unknown'}"?`)) {
        tasks = tasks.filter(t => t.id !== id);
        saveToLocalStorage();
        renderAll();
    }
}

// --- Modal Openers ---
function openTaskModal(courseId) {
    if (courseId) {
        // Add new task
        document.getElementById('taskModalTitle').textContent = 'Add New Task';
        document.getElementById('taskId').value = '';
        document.getElementById('taskTitle').value = '';
        document.getElementById('taskType').value = 'assignment';
        document.getElementById('taskPriority').value = 'medium';
        document.getElementById('taskCourse').value = courseId;
        document.getElementById('taskDeadline').value = '';
        document.getElementById('addTaskModal').classList.remove('hidden');
    } else {
        // Add new task without course
        document.getElementById('taskModalTitle').textContent = 'Add New Task';
        document.getElementById('taskId').value = '';
        document.getElementById('taskTitle').value = '';
        document.getElementById('taskType').value = 'assignment';
        document.getElementById('taskPriority').value = 'medium';
        document.getElementById('taskCourse').value = '';
        document.getElementById('taskDeadline').value = '';
        document.getElementById('addTaskModal').classList.remove('hidden');
    }
}

// --- Course Grid ---
function renderCoursesGrid() {
    const grid = document.getElementById('coursesGrid');
    if (!grid) return;
    
    if (courses.length === 0) {
        grid.innerHTML = '<div class="empty-state"><div class="empty-icon">🎓</div><p>No courses yet. Add your first course above!</p></div>';
        return;
    }
    
    grid.innerHTML = courses.map(course => {
        const total = tasks.filter(t => t.courseId === course.id).length;
        const completed = tasks.filter(t => t.courseId === course.id && t.completed).length;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        
        return `
            <div class="course-card" style="border-top: 4px solid ${course.color};">
                <div class="course-header">
                    <div class="course-name">${escapeHtml(course.name)}</div>
                    <span class="course-badge" style="background: ${course.color}">${course.color}</span>
                </div>
                <div class="course-stats">
                    <div class="course-stat"><strong>${total}</strong><span>Total</span></div>
                    <div class="course-stat"><strong>${completed}</strong><span>Completed</span></div>
                    <div class="course-stat"><strong>${pct}%</strong><span>Progress</span></div>
                </div>
                <div class="course-progress-bar">
                    <div class="course-progress-fill" style="width: ${total > 0 ? Math.min(pct, 100) : 0}%; background: ${course.color};"></div>
                </div>
                <div class="course-actions">
                    <button class="btn btn-sm btn-primary" onclick="openTaskModal(${course.id})">+ Add Task</button>
                    <button class="btn btn-sm btn-secondary" onclick="openCourseModal(${course.id})">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteCourse(${course.id})">Delete</button>
                </div>
            </div>`;
    }).join('');
}

// --- Update page title ---
function updatePageTitle() {
    const titles = {
        'dashboard': 'Dashboard',
        'courses': 'Courses',
        'calendar': 'Calendar',
        'deadlines': 'Deadlines'
    };
    document.getElementById('pageTitle').textContent = titles[currentView];
}

// --- Color picker initialization ---
function initColorPicker() {
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
    const picker = document.getElementById('courseColorPicker');
    if (picker) {
        picker.innerHTML = colors.map(color => {
            return `<div class="color-option ${color === selectedColor ? 'selected' : ''}" data-color="${color}" style="background: ${color};"></div>`;
        }).join('');
    }
}

// Start the app
init();