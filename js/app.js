// 전역 변수
let currentUser = null;
let currentDate = new Date();
let currentWeekStart = null;
let allTasks = [];
let allUsers = [];
let allRequests = [];

// 날짜 포맷 함수
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateKorean(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const weekday = weekdays[date.getDay()];
    return `${year}년 ${month}월 ${day}일 (${weekday})`;
}

// 주의 시작일(월요일) 계산
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

// 주의 끝일(일요일) 계산
function getWeekEnd(date) {
    const start = getWeekStart(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return end;
}

// 주간 범위 포맷
function formatWeekRange(startDate) {
    const start = new Date(startDate);
    const end = getWeekEnd(start);
    
    const startMonth = start.getMonth() + 1;
    const startDay = start.getDate();
    const endMonth = end.getMonth() + 1;
    const endDay = end.getDate();
    
    if (startMonth === endMonth) {
        return `${startMonth}월 ${startDay}일 ~ ${endDay}일`;
    } else {
        return `${startMonth}월 ${startDay}일 ~ ${endMonth}월 ${endDay}일`;
    }
}

// 페이지 타이틀 업데이트
function updatePageTitle() {
    const today = new Date();
    const formattedDate = formatDateKorean(today);
    document.title = `협업 업무 관리 - ${formattedDate}`;
}

// 로딩 스피너
function showLoading() {
    document.getElementById('loadingSpinner').classList.add('active');
}

function hideLoading() {
    document.getElementById('loadingSpinner').classList.remove('active');
}

// 화면 전환
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

// 로그인
async function login(username) {
    if (!username || username.trim() === '') {
        alert('사용자 이름을 입력해주세요.');
        return;
    }

    showLoading();

    try {
        const users = await supabaseFetch('users?select=*&limit=1000');
        
        let user;
        const existingUser = users.find(u => u.username === username.trim());
        
        if (existingUser) {
            const now = new Date().toISOString();
            const result = await supabaseFetch(`users?id=eq.${existingUser.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    is_online: true,
                    last_active_at: now
                })
            });
            user = result[0];
        } else {
            const now = new Date().toISOString();
            const result = await supabaseFetch('users', {
                method: 'POST',
                body: JSON.stringify({
                    username: username.trim(),
                    is_online: true,
                    last_active_at: now,
                    created_at: now
                })
            });
            user = result[0];
        }

        currentUser = user;
        localStorage.setItem('currentUser', JSON.stringify(user));

        document.getElementById('currentUserName').textContent = user.username;
        showScreen('mainScreen');
        
        await loadAllData();
        updateDateDisplay();
        updatePageTitle();
        
        currentWeekStart = getWeekStart(new Date());
        updateWeekDisplay();
        
        await checkAndMigrateTasks();
        await deleteOldCompletedTasks();
        
        updateLoginButton(true);

    } catch (error) {
        console.error('로그인 오류:', error);
        alert('로그인 중 오류가 발생했습니다: ' + error.message);
    } finally {
        hideLoading();
    }
}

// 로그아웃
function logout() {
    if (currentUser) {
        updateUserOnlineStatus(false);
    }
    
    currentUser = null;
    localStorage.removeItem('currentUser');
    showScreen('loginScreen');
    document.getElementById('usernameInput').value = '';
    
    updateLoginButton(false);
}

// 로그인 버튼 텍스트 업데이트
function updateLoginButton(isLoggedIn) {
    const loginBtn = document.getElementById('loginBtn');
    const loginBtnText = document.getElementById('loginBtnText');
    const loginIcon = loginBtn.querySelector('i');
    const usernameInput = document.getElementById('usernameInput');
    const loginUserInfo = document.getElementById('loginUserInfo');
    const loginUserName = document.getElementById('loginUserName');
    
    if (isLoggedIn) {
        loginBtnText.textContent = '로그아웃';
        loginIcon.className = 'fas fa-sign-out-alt';
        loginBtn.classList.remove('primary-btn');
        loginBtn.classList.add('secondary-btn');
        
        usernameInput.style.display = 'none';
        loginUserInfo.style.display = 'block';
        if (currentUser) {
            loginUserName.textContent = currentUser.username;
        }
    } else {
        loginBtnText.textContent = '로그인';
        loginIcon.className = 'fas fa-sign-in-alt';
        loginBtn.classList.remove('secondary-btn');
        loginBtn.classList.add('primary-btn');
        
        usernameInput.style.display = 'block';
        loginUserInfo.style.display = 'none';
    }
}

// 온라인 상태 업데이트
async function updateUserOnlineStatus(isOnline) {
    if (!currentUser) return;
    
    try {
        await supabaseFetch(`users?id=eq.${currentUser.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                is_online: isOnline,
                last_active_at: new Date().toISOString()
            })
        });
    } catch (error) {
        console.error('온라인 상태 업데이트 오류:', error);
    }
}

// 하트비트
async function sendHeartbeat() {
    if (!currentUser) return;
    
    try {
        await supabaseFetch(`users?id=eq.${currentUser.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                is_online: true,
                last_active_at: new Date().toISOString()
            })
        });
    } catch (error) {
        console.error('하트비트 전송 오류:', error);
    }
}

// 온라인 여부 확인
function isUserOnline(user) {
    if (!user.last_active_at) return false;
    const now = new Date();
    const lastActive = new Date(user.last_active_at);
    const timeDiff = now - lastActive;
    return timeDiff < 120000;
}

// 모든 데이터 로드
async function loadAllData() {
    console.log('데이터 로드 시작...');
    showLoading();
    try {
        allUsers = await supabaseFetch('users?select=*&limit=1000');
        console.log('사용자 수:', allUsers.length);

        allTasks = await supabaseFetch('tasks?select=*&limit=1000');
        console.log('업무 수:', allTasks.length);

        allRequests = await supabaseFetch('requests?select=*&limit=1000');
        console.log('요청사항 수:', allRequests.length);

        renderAllTasks();
        renderRequests();
        console.log('데이터 로드 완료');
    } catch (error) {
        console.error('데이터 로드 오류:', error);
        alert('데이터를 불러오는 중 오류가 발생했습니다: ' + error.message);
    } finally {
        hideLoading();
    }
}

// 날짜 이동
function changeDate(days) {
    currentDate.setDate(currentDate.getDate() + days);
    updateDateDisplay();
    renderAllTasks();
}

function goToToday() {
    currentDate = new Date();
    updateDateDisplay();
    renderAllTasks();
}

function updateDateDisplay() {
    document.getElementById('currentDate').textContent = formatDateKorean(currentDate);
}

// 주간 이동
function changeWeek(weeks) {
    const newWeekStart = new Date(currentWeekStart);
    newWeekStart.setDate(newWeekStart.getDate() + (weeks * 7));
    currentWeekStart = newWeekStart;
    updateWeekDisplay();
    renderTeamCompletedTasks();
}

function goToThisWeek() {
    currentWeekStart = getWeekStart(new Date());
    updateWeekDisplay();
    renderTeamCompletedTasks();
}

function updateWeekDisplay() {
    document.getElementById('weekRange').textContent = formatWeekRange(currentWeekStart);
}

// 업무 추가
async function addTask(title) {
    if (!title || title.trim() === '') {
        alert('업무 내용을 입력해주세요.');
        return;
    }

    showLoading();
    try {
        const taskData = {
            user_id: currentUser.id,
            title: title.trim(),
            task_date: formatDate(currentDate),
            is_shared: false,
            is_completed: false,
            created_at: new Date().toISOString()
        };

        const result = await supabaseFetch('tasks', {
            method: 'POST',
            body: JSON.stringify(taskData)
        });

        const newTask = result[0];
        allTasks.push(newTask);

        document.getElementById('newTaskInput').value = '';
        renderAllTasks();

    } catch (error) {
        console.error('업무 추가 오류:', error);
        alert('업무 추가 중 오류가 발생했습니다.');
    } finally {
        hideLoading();
    }
}

// 업무 완료 토글
async function toggleTaskComplete(taskId) {
    showLoading();
    try {
        const task = allTasks.find(t => t.id === taskId);
        if (!task) return;

        const updateData = {
            is_completed: !task.is_completed,
            completed_at: !task.is_completed ? new Date().toISOString() : null
        };

        const result = await supabaseFetch(`tasks?id=eq.${taskId}`, {
            method: 'PATCH',
            body: JSON.stringify(updateData)
        });

        const updatedTask = result[0];
        const index = allTasks.findIndex(t => t.id === taskId);
        if (index !== -1) {
            allTasks[index] = updatedTask;
        }

        renderAllTasks();

    } catch (error) {
        console.error('업무 완료 토글 오류:', error);
        alert('업무 상태 변경 중 오류가 발생했습니다.');
    } finally {
        hideLoading();
    }
}

// 업무 공유 토글
async function toggleTaskShare(taskId) {
    showLoading();
    try {
        const task = allTasks.find(t => t.id === taskId);
        if (!task) return;

        const updateData = {
            is_shared: !task.is_shared
        };

        const result = await supabaseFetch(`tasks?id=eq.${taskId}`, {
            method: 'PATCH',
            body: JSON.stringify(updateData)
        });

        const updatedTask = result[0];
        const index = allTasks.findIndex(t => t.id === taskId);
        if (index !== -1) {
            allTasks[index] = updatedTask;
        }

        renderAllTasks();

    } catch (error) {
        console.error('업무 공유 토글 오류:', error);
        alert('업무 공유 상태 변경 중 오류가 발생했습니다.');
    } finally {
        hideLoading();
    }
}

// 업무 삭제
async function deleteTask(taskId) {
    if (!confirm('이 업무를 삭제하시겠습니까?')) {
        return;
    }

    showLoading();
    try {
        await supabaseFetch(`tasks?id=eq.${taskId}`, {
            method: 'DELETE'
        });

        allTasks = allTasks.filter(t => t.id !== taskId);
        renderAllTasks();

    } catch (error) {
        console.error('업무 삭제 오류:', error);
        alert('업무 삭제 중 오류가 발생했습니다.');
    } finally {
        hideLoading();
    }
}

// 업무 렌더링
function renderAllTasks() {
    const selectedDate = formatDate(currentDate);
    
    const myTasks = allTasks.filter(t => 
        t.user_id === currentUser.id && t.task_date === selectedDate
    );
    
    const myPending = myTasks.filter(t => !t.is_completed);
    const myCompleted = myTasks.filter(t => t.is_completed);

    renderMyTasks('myPendingTasks', myPending, true);
    renderMyTasks('myCompletedTasks', myCompleted, true);
    document.getElementById('myTaskCount').textContent = `${myTasks.length}개`;

    const sharedTasks = allTasks.filter(t => 
        t.is_shared && !t.is_completed && t.task_date === selectedDate
    );
    renderTeamSharedTasks(sharedTasks);
    document.getElementById('sharedTaskCount').textContent = `${sharedTasks.length}개`;

    renderTeamCompletedTasks();
}

// 내 업무 렌더링
function renderMyTasks(containerId, tasks, showActions) {
    const container = document.getElementById(containerId);
    
    if (tasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>업무가 없습니다</p>
            </div>
        `;
        return;
    }

    container.innerHTML = tasks.map(task => `
        <div class="task-item ${task.is_shared ? 'shared' : ''} ${task.is_completed ? 'completed' : ''}">
            <div class="task-header">
                <div class="task-title ${task.is_completed ? 'completed' : ''}">
                    ${escapeHtml(task.title)}
                </div>
                ${showActions ? `
                <div class="task-actions">
                    <button class="task-btn check-btn ${task.is_completed ? 'checked' : ''}" 
                            onclick="toggleTaskComplete('${task.id}')"
                            title="${task.is_completed ? '완료 취소' : '완료'}">
                        <i class="fas fa-check"></i>
                    </button>
                    ${!task.is_completed ? `
                    <button class="task-btn share-btn ${task.is_shared ? 'shared' : ''}" 
                            onclick="toggleTaskShare('${task.id}')"
                            title="${task.is_shared ? '공유 취소' : '공유'}">
                        <i class="fas fa-share-alt"></i>
                    </button>
                    ` : ''}
                    <button class="task-btn delete-btn" 
                            onclick="deleteTask('${task.id}')"
                            title="삭제">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                ` : ''}
            </div>
            <div class="task-meta">
                ${task.is_shared ? '<span><i class="fas fa-share-alt"></i> 공유됨</span>' : ''}
                ${task.is_completed && task.completed_at ? 
                    `<span><i class="fas fa-check-circle"></i> ${new Date(task.completed_at).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'})}</span>` 
                    : ''}
            </div>
        </div>
    `).join('');
}

// 팀 공유 업무 렌더링
function renderTeamSharedTasks(sharedTasks) {
    const container = document.getElementById('teamSharedTasks');
    
    if (sharedTasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <p>공유된 업무가 없습니다</p>
            </div>
        `;
        return;
    }

    const tasksByUser = {};
    sharedTasks.forEach(task => {
        if (!tasksByUser[task.user_id]) {
            tasksByUser[task.user_id] = [];
        }
        tasksByUser[task.user_id].push(task);
    });

    container.innerHTML = Object.keys(tasksByUser).map(userId => {
        const user = allUsers.find(u => u.id === userId);
        const userName = user ? user.username : '알 수 없음';
        const tasks = tasksByUser[userId];

        return `
            <div class="team-member-tasks">
                <div class="team-member-header">
                    <i class="fas fa-user-circle"></i>
                    ${escapeHtml(userName)}
                    <span style="color: var(--text-secondary); font-weight: normal; font-size: 14px;">
                        (${tasks.length}개)
                    </span>
                </div>
                <div class="team-task-list">
                    ${tasks.map(task => `
                        <div class="task-item shared">
                            <div class="task-header">
                                <div class="task-title">${escapeHtml(task.title)}</div>
                            </div>
                            <div class="task-meta">
                                <span><i class="fas fa-share-alt"></i> 공유됨</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

// 팀원별 완료 업무 렌더링
function renderTeamCompletedTasks() {
    const container = document.getElementById('teamCompletedTasks');
    
    const weekStart = formatDate(currentWeekStart);
    const weekEnd = formatDate(getWeekEnd(currentWeekStart));
    
    const completedTasks = allTasks.filter(t => {
        const taskDate = t.task_date;
        return t.user_id !== currentUser.id && 
               (t.is_shared || t.is_completed) && 
               t.is_completed && 
               taskDate >= weekStart && 
               taskDate <= weekEnd;
    });

    if (completedTasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-check-circle"></i>
                <p>이번 주 팀원들의 완료된 업무가 없습니다</p>
            </div>
        `;
        return;
    }

    const tasksByUser = {};
    completedTasks.forEach(task => {
        if (!tasksByUser[task.user_id]) {
            tasksByUser[task.user_id] = [];
        }
        tasksByUser[task.user_id].push(task);
    });

    container.innerHTML = Object.keys(tasksByUser).map(userId => {
        const user = allUsers.find(u => u.id === userId);
        const userName = user ? user.username : '알 수 없음';
        const tasks = tasksByUser[userId];
        
        const tasksByDate = {};
        tasks.forEach(task => {
            if (!tasksByDate[task.task_date]) {
                tasksByDate[task.task_date] = [];
            }
            tasksByDate[task.task_date].push(task);
        });

        return `
            <div class="team-member-tasks">
                <div class="team-member-header">
                    <i class="fas fa-user-check"></i>
                    ${escapeHtml(userName)}
                    <span style="color: var(--text-secondary); font-weight: normal; font-size: 14px;">
                        (${tasks.length}개 완료)
                    </span>
                </div>
                <div class="team-task-list">
                    ${Object.keys(tasksByDate).sort().reverse().map(date => {
                        const dateTasks = tasksByDate[date];
                        const dateObj = new Date(date + 'T00:00:00');
                        const dateStr = formatDateKorean(dateObj);
                        
                        return `
                            <div style="margin-bottom: 16px;">
                                <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px; font-weight: 600;">
                                    <i class="fas fa-calendar"></i> ${dateStr}
                                </div>
                                ${dateTasks.map(task => `
                                    <div class="task-item completed">
                                        <div class="task-header">
                                            <div class="task-title completed">${escapeHtml(task.title)}</div>
                                        </div>
                                        <div class="task-meta">
                                            ${task.is_shared ? '<span><i class="fas fa-share-alt"></i> 공유됨</span>' : ''}
                                            <span><i class="fas fa-check-circle"></i> 
                                                ${new Date(task.completed_at).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'})}
                                            </span>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }).join('');
}

// 자동 이관
async function checkAndMigrateTasks() {
    const today = formatDate(new Date());
    
    try {
        const oldTasks = allTasks.filter(t => 
            t.user_id === currentUser.id &&
            !t.is_completed && 
            t.task_date < today
        );

        if (oldTasks.length === 0) return;

        for (const task of oldTasks) {
            const updateData = {
                task_date: today
            };

            const result = await supabaseFetch(`tasks?id=eq.${task.id}`, {
                method: 'PATCH',
                body: JSON.stringify(updateData)
            });

            const updatedTask = result[0];
            const index = allTasks.findIndex(t => t.id === task.id);
            if (index !== -1) {
                allTasks[index] = updatedTask;
            }
        }

        console.log(`${oldTasks.length}개의 미완료 업무를 오늘로 이관했습니다.`);

    } catch (error) {
        console.error('업무 이관 오류:', error);
    }
}

// 오래된 완료 업무 삭제
async function deleteOldCompletedTasks() {
    try {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const cutoffDate = formatDate(sixMonthsAgo);
        
        const oldCompletedTasks = allTasks.filter(t => 
            t.is_completed && 
            t.task_date < cutoffDate
        );

        if (oldCompletedTasks.length === 0) {
            console.log('삭제할 오래된 완료 업무가 없습니다.');
            return;
        }

        console.log(`${oldCompletedTasks.length}개의 6개월 이상 완료된 업무를 삭제합니다...`);

        for (const task of oldCompletedTasks) {
            try {
                await supabaseFetch(`tasks?id=eq.${task.id}`, {
                    method: 'DELETE'
                });
                
                const index = allTasks.findIndex(t => t.id === task.id);
                if (index !== -1) {
                    allTasks.splice(index, 1);
                }
                
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error(`업무 삭제 실패 (ID: ${task.id}):`, error);
            }
        }

        console.log(`${oldCompletedTasks.length}개의 오래된 완료 업무 삭제 완료`);
        
    } catch (error) {
        console.error('오래된 업무 삭제 오류:', error);
    }
}

// HTML 이스케이프
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// 요청사항 렌더링
function renderRequests() {
    const receivedRequests = allRequests.filter(r => r.to_user_id === currentUser.id);
    const unreadReceived = receivedRequests.filter(r => !r.is_read);
    renderRequestList('receivedRequests', receivedRequests);
    document.getElementById('receivedRequestBadge').textContent = unreadReceived.length;
    
    const sentRequests = allRequests.filter(r => r.from_user_id === currentUser.id);
    const pendingSent = sentRequests.filter(r => r.status === 'pending');
    renderRequestList('sentRequests', sentRequests);
    document.getElementById('sentRequestBadge').textContent = pendingSent.length;
}

// 요청 목록 렌더링
function renderRequestList(containerId, requests) {
    const container = document.getElementById(containerId);
    
    if (requests.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>요청사항이 없습니다</p>
            </div>
        `;
        return;
    }
    
    requests.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    container.innerHTML = requests.map(request => {
        const fromUser = allUsers.find(u => u.id === request.from_user_id);
        const toUser = allUsers.find(u => u.id === request.to_user_id);
        const fromUserName = fromUser ? fromUser.username : '알 수 없음';
        const toUserName = toUser ? toUser.username : '알 수 없음';
        
        const statusText = {
            'pending': '대기중',
            'accepted': '수락됨',
            'rejected': '거절됨'
        }[request.status] || '알 수 없음';
        
        const targetUser = containerId === 'receivedRequests' ? fromUser : toUser;
        const isOnline = targetUser ? isUserOnline(targetUser) : false;
        
        const readIndicator = containerId === 'receivedRequests' && !request.is_read ? 
            '<span class="read-indicator unread"><i class="fas fa-circle"></i> 읽지 않음</span>' : '';
        
        return `
            <div class="request-item ${request.status}" onclick="showRequestDetail('${request.id}')">
                <div class="request-header">
                    <div class="request-title">${escapeHtml(request.title)}</div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${readIndicator}
                        <span class="request-status ${request.status}">${statusText}</span>
                    </div>
                </div>
                <div class="request-info">
                    ${containerId === 'receivedRequests' ? 
                        `<span class="user-status">
                            <span class="status-dot ${isOnline ? 'online' : 'offline'}"></span>
                            <i class="fas fa-user"></i> ${escapeHtml(fromUserName)}님이 보냄
                        </span>` : 
                        `<span class="user-status">
                            <span class="status-dot ${isOnline ? 'online' : 'offline'}"></span>
                            <i class="fas fa-user"></i> ${escapeHtml(toUserName)}님에게 보냄
                        </span>`}
                    <span style="margin-left: 12px;">
                        <i class="fas fa-clock"></i> ${new Date(request.created_at).toLocaleString('ko-KR', {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                    </span>
                </div>
                <div class="request-message">${escapeHtml(request.message)}</div>
            </div>
        `;
    }).join('');
}

// 새 요청 모달
function openNewRequestModal() {
    const userSelect = document.getElementById('requestToUser');
    const otherUsers = allUsers.filter(u => u.id !== currentUser.id);
    
    otherUsers.sort((a, b) => {
        const aOnline = isUserOnline(a);
        const bOnline = isUserOnline(b);
        if (aOnline && !bOnline) return -1;
        if (!aOnline && bOnline) return 1;
        return a.username.localeCompare(b.username);
    });
    
    userSelect.innerHTML = '<option value="">선택하세요</option>' + 
        otherUsers.map(user => {
            const online = isUserOnline(user);
            const statusEmoji = online ? '🟢' : '⚫';
            return `<option value="${user.id}">${statusEmoji} ${escapeHtml(user.username)}</option>`;
        }).join('');
    
    document.getElementById('requestTitle').value = '';
    document.getElementById('requestMessage').value = '';
    
    document.getElementById('requestModal').classList.add('active');
}

// 요청 전송
async function sendRequest() {
    const toUserId = document.getElementById('requestToUser').value;
    const title = document.getElementById('requestTitle').value.trim();
    const message = document.getElementById('requestMessage').value.trim();
    
    if (!toUserId) {
        alert('받는 사람을 선택해주세요.');
        return;
    }
    
    if (!title) {
        alert('제목을 입력해주세요.');
        return;
    }
    
    if (!message) {
        alert('요청 내용을 입력해주세요.');
        return;
    }
    
    showLoading();
    try {
        const requestData = {
            from_user_id: currentUser.id,
            to_user_id: toUserId,
            title: title,
            message: message,
            status: 'pending',
            is_read: false,
            created_at: new Date().toISOString()
        };
        
        const result = await supabaseFetch('requests', {
            method: 'POST',
            body: JSON.stringify(requestData)
        });
        
        const newRequest = result[0];
        allRequests.push(newRequest);
        
        closeRequestModal();
        renderRequests();
        alert('요청이 전<span class="cursor">█</span>
