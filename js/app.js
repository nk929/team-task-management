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

function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

function getWeekEnd(date) {
    const start = getWeekStart(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return end;
}

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

function updatePageTitle() {
    const today = new Date();
    const formattedDate = formatDateKorean(today);
    document.title = `협업 업무 관리 - ${formattedDate}`;
}

function showLoading() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) spinner.classList.remove('hidden');
}

function hideLoading() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) spinner.classList.add('hidden');
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

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

function logout() {
    if (currentUser) {
        updateUserOnlineStatus(false);
    }
    currentUser = null;
    localStorage.removeItem('currentUser');
    showScreen('loginScreen');
    updateLoginButton(false);
}

function updateLoginButton(isLoggedIn) {
    const loginBtn = document.getElementById('loginBtn');
    const loginBtnText = document.getElementById('loginBtnText');
    const usernameInput = document.getElementById('usernameInput');
    const loginUserInfo = document.getElementById('loginUserInfo');
    if (isLoggedIn) {
        loginBtnText.textContent = '로그아웃';
        loginBtn.classList.add('logout');
        usernameInput.style.display = 'none';
        loginUserInfo.classList.remove('hidden');
    } else {
        loginBtnText.textContent = '로그인';
        loginBtn.classList.remove('logout');
        usernameInput.style.display = 'block';
        usernameInput.value = '';
        loginUserInfo.classList.add('hidden');
    }
}

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

function isUserOnline(user) {
    if (!user.last_active_at) return false;
    const now = new Date();
    const lastActive = new Date(user.last_active_at);
    const timeDiff = now - lastActive;
    return timeDiff < 120000;
}

async function loadAllData() {
    console.log('데이터 로드 시작...');
    showLoading();
    try {
        console.log('사용자 목록 로드 중...');
        allUsers = await supabaseFetch('users?select=*&limit=1000');
        console.log('사용자 수:', allUsers.length);
        console.log('업무 목록 로드 중...');
        allTasks = await supabaseFetch('tasks?select=*&limit=1000');
        console.log('업무 수:', allTasks.length);
        console.log('요청사항 목록 로드 중...');
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

function changeWeek(weeks) {
    const newWeekStart = new Date(currentWeekStart);
    newWeekStart.setDate(newWeekStart.getDate() + (weeks * 7));
    currentWeekStart = newWeekStart;
    updateWeekDisplay();
    renderAllTasks();
}

function updateWeekDisplay() {
    document.getElementById('currentWeek').textContent = formatWeekRange(currentWeekStart);
}

async function addTask() {
    const title = document.getElementById('newTaskInput').value;
    if (!title || title.trim() === '') {
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
        alert('업무 공유 설정 중 오류가 발생했습니다.');
    } finally {
        hideLoading();
    }
}

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
    const teamSharedTasks = allTasks.filter(t => 
        t.user_id !== currentUser.id && t.is_shared && !t.is_completed && t.task_date === selectedDate
    );
    renderTeamSharedTasks('teamSharedTasks', teamSharedTasks);
    document.getElementById('teamSharedCount').textContent = `${teamSharedTasks.length}개`;
    const weekStart = formatDate(getWeekStart(currentWeekStart));
    const weekEnd = formatDate(getWeekEnd(currentWeekStart));
    const teamCompletedTasks = allTasks.filter(t => 
        t.user_id !== currentUser.id && t.is_completed && t.task_date >= weekStart && t.task_date <= weekEnd
    );
    renderTeamCompletedTasks('teamCompletedTasks', teamCompletedTasks);
    document.getElementById('teamCompletedCount').textContent = `${teamCompletedTasks.length}개`;
}

function renderMyTasks(elementId, tasks, showActions) {
    const container = document.getElementById(elementId);
    if (tasks.length === 0) {
        container.innerHTML = '<div class="empty-message">업무가 없습니다</div>';
        return;
    }
    container.innerHTML = tasks.map(task => {
        const isCompleted = task.is_completed;
        const isShared = task.is_shared;
        return `
            <div class="task-item ${isCompleted ? 'completed' : ''}">
                <div class="task-content">
                    <span class="task-title ${isCompleted ? 'line-through' : ''}">${task.title}</span>
                    ${isShared ? '<span class="badge badge-shared">공유됨</span>' : ''}
                </div>
                ${showActions ? `
                    <div class="task-actions">
                        <button class="btn-icon" onclick="toggleTaskComplete('${task.id}')" title="${isCompleted ? '완료 취소' : '완료'}">
                            ${isCompleted ? '↩️' : '✓'}
                        </button>
                        <button class="btn-icon" onclick="toggleTaskShare('${task.id}')" title="${isShared ? '공유 취소' : '팀과 공유'}">
                            ${isShared ? '🔓' : '🔗'}
                        </button>
                        <button class="btn-icon" onclick="deleteTask('${task.id}')" title="삭제">
                            🗑️
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

function renderTeamSharedTasks(elementId, tasks) {
    const container = document.getElementById(elementId);
    if (tasks.length === 0) {
        container.innerHTML = '<div class="empty-message">공유된 업무가 없습니다</div>';
        return;
    }
    const tasksByUser = {};
    tasks.forEach(task => {
        if (!tasksByUser[task.user_id]) {
            tasksByUser[task.user_id] = [];
        }
        tasksByUser[task.user_id].push(task);
    });
    container.innerHTML = Object.entries(tasksByUser).map(([userId, userTasks]) => {
        const user = allUsers.find(u => u.id === userId);
        const username = user ? user.username : '알 수 없음';
        const online = user ? isUserOnline(user) : false;
        return `
            <div class="user-section">
                <div class="user-header">
                    <span class="username">
                        <span class="status-indicator ${online ? 'online' : 'offline'}"></span>
                        ${username}
                    </span>
                    <span class="task-count">${userTasks.length}개</span>
                </div>
                ${userTasks.map(task => `
                    <div class="task-item">
                        <div class="task-content">
                            <span class="task-title">${task.title}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }).join('');
}

function renderTeamCompletedTasks(elementId, tasks) {
    const container = document.getElementById(elementId);
    if (tasks.length === 0) {
        container.innerHTML = '<div class="empty-message">완료된 업무가 없습니다</div>';
        return;
    }
    const tasksByUser = {};
    tasks.forEach(task => {
        if (!tasksByUser[task.user_id]) {
            tasksByUser[task.user_id] = [];
        }
        tasksByUser[task.user_id].push(task);
    });
    container.innerHTML = Object.entries(tasksByUser).map(([userId, userTasks]) => {
        const user = allUsers.find(u => u.id === userId);
        const username = user ? user.username : '알 수 없음';
        const online = user ? isUserOnline(user) : false;
        return `
            <div class="user-section">
                <div class="user-header">
                    <span class="username">
                        <span class="status-indicator ${online ? 'online' : 'offline'}"></span>
                        ${username}
                    </span>
                    <span class="task-count">${userTasks.length}개</span>
                </div>
                ${userTasks.map(task => `
                    <div class="task-item completed">
                        <div class="task-content">
                            <span class="task-title line-through">${task.title}</span>
                            <span class="task-date">${task.task_date}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }).join('');
}

async function checkAndMigrateTasks() {
    const today = formatDate(new Date());
    try {
        const oldTasks = allTasks.filter(t => 
            t.user_id === currentUser.id && !t.is_completed && t.task_date < today
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

async function deleteOldCompletedTasks() {
    try {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const cutoffDate = formatDate(sixMonthsAgo);
        const oldCompletedTasks = allTasks.filter(t => 
            t.is_completed && t.task_date < cutoffDate
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
                console.error(`업무 삭제 오류 (ID: ${task.id}):`, error);
            }
        }
        console.log('오래된 완료 업무 삭제 완료');
    } catch (error) {
        console.error('오래된 업무 삭제 중 오류:', error);
    }
}

function renderRequests() {
    const receivedRequests = allRequests.filter(r => r.to_user_id === currentUser.id);
    const sentRequests = allRequests.filter(r => r.from_user_id === currentUser.id);
    renderRequestList('receivedRequests', receivedRequests, 'received');
    renderRequestList('sentRequests', sentRequests, 'sent');
    document.getElementById('receivedCount').textContent = `${receivedRequests.length}개`;
    document.getElementById('sentCount').textContent = `${sentRequests.length}개`;
}

function renderRequestList(elementId, requests, type) {
    const container = document.getElementById(elementId);
    if (requests.length === 0) {
        container.innerHTML = '<div class="empty-message">요청사항이 없습니다</div>';
        return;
    }
    container.innerHTML = requests.map(request => {
        const fromUser = allUsers.find(u => u.id === request.from_user_id);
        const toUser = allUsers.find(u => u.id === request.to_user_id);
        const fromUsername = fromUser ? fromUser.username : '알 수 없음';
        const toUsername = toUser ? toUser.username : '알 수 없음';
        let statusBadge = '';
        if (request.status === 'pending') {
            statusBadge = '<span class="badge badge-pending">대기중</span>';
        } else if (request.status === 'accepted') {
            if (request.is_completed) {
                statusBadge = '<span class="badge badge-completed">완료됨 ✅</span>';
            } else {
                statusBadge = '<span class="badge badge-accepted">수락됨</span>';
            }
        } else if (request.status === 'rejected') {
            statusBadge = '<span class="badge badge-rejected">거절됨</span>';
        }
        const unreadBadge = type === 'received' && !request.is_read ? 
            '<span class="badge badge-unread">안읽음</span>' : '';
        return `
            <div class="request-item ${!request.is_read && type === 'received' ? 'unread' : ''}" 
                 onclick="showRequestDetail('${request.id}')">
                <div class="request-header">
                    <span class="request-user">
                        ${type === 'received' ? `보낸 사람: ${fromUsername}` : `받는 사람: ${toUsername}`}
                    </span>
                    ${statusBadge}
                    ${unreadBadge}
                </div>
                <div class="request-title">${request.title}</div>
                <div class="request-date">${new Date(request.created_at).toLocaleString('ko-KR')}</div>
            </div>
        `;
    }).join('');
}

function openNewRequestModal() {
    console.log('새 요청 모달 열기');
    const modal = document.getElementById('requestModal');
    const toUserSelect = document.getElementById('toUserSelect');
    if (!modal || !toUserSelect) {
        alert('모달을 찾을 수 없습니다.');
        return;
    }
    const otherUsers = allUsers.filter(u => u.id !== currentUser.id);
    if (otherUsers.length === 0) {
        alert('요청을 보낼 다른 사용자가 없습니다.');
        return;
    }
    toUserSelect.innerHTML = '<option value="">받을 사람 선택</option>' + 
        otherUsers.map(user => {
            const online = isUserOnline(user);
            return `<option value="${user.id}">${user.username} ${online ? '🟢' : '⚫'}</option>`;
        }).join('');
    modal.classList.add('active');
}

async function sendRequest() {
    const toUserId = document.getElementById('toUserSelect').value;
    const title = document.getElementById('requestTitle').value;
    const message = document.getElementById('requestMessage').value;
    if (!toUserId || !title || !message) {
        alert('모든 필드를 입력해주세요.');
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
            is_completed: false,
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
        alert('요청이 전송되었습니다!');
    } catch (error) {
        console.error('요청 전송 오류:', error);
        alert('요청 전송 중 오류가 발생했습니다.');
    } finally {
        hideLoading();
    }
}

async function showRequestDetail(requestId) {
    const request = allRequests.find(r => r.id === requestId);
    if (!request) return;
    if (request.to_user_id === currentUser.id && !request.is_read) {
        try {
            const result = await supabaseFetch(`requests?id=eq.${requestId}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    is_read: true,
                    read_at: new Date().toISOString()
                })
            });
            const updatedRequest = result[0];
            const index = allRequests.findIndex(r => r.id === requestId);
            if (index !== -1) {
                allRequests[index] = updatedRequest;
            }
            renderRequests();
        } catch (error) {
            console.error('읽음 처리 오류:', error);
        }
    }
    const fromUser = allUsers.find(u => u.id === request.from_user_id);
    const toUser = allUsers.find(u => u.id === request.to_user_id);
    const fromUsername = fromUser ? fromUser.username : '알 수 없음';
    const toUsername = toUser ? toUser.username : '알 수 없음';
    document.getElementById('detailFromUser').textContent = fromUsername;
    document.getElementById('detailToUser').textContent = toUsername;
    document.getElementById('detailTitle').textContent = request.title;
    document.getElementById('detailMessage').textContent = request.message;
    let statusText = '';
    if (request.status === 'pending') {
        statusText = '대기중';
    } else if (request.status === 'accepted') {
        if (request.is_completed) {
            statusText = '완료됨 ✅';
        } else {
            statusText = '수락됨';
        }
    } else if (request.status === 'rejected') {
        statusText = '거절됨';
    }
    document.getElementById('detailStatus').textContent = statusText;
    const responseSection = document.getElementById('detailResponse');
    let responseHTML = '';
    if (request.response_message) {
        responseHTML += `<strong>응답:</strong> ${request.response_message}<br>`;
    }
    if (request.is_completed && request.completed_at) {
        const completedDate = new Date(request.completed_at).toLocaleString('ko-KR');
        responseHTML += `<strong>완료 시간:</strong> ${completedDate}`;
    }
    responseSection.innerHTML = responseHTML || '';
    const actionsSection = document.getElementById('detailActions');
    if (request.to_user_id === currentUser.id && request.status === 'pending') {
        actionsSection.innerHTML = `
            <button class="btn btn-primary" onclick="respondToRequest('${request.id}', 'accepted')">수락</button>
            <button class="btn btn-secondary" onclick="respondToRequest('${request.id}', 'rejected')">거절</button>
        `;
    } else if (request.to_user_id === currentUser.id && request.status === 'accepted' && !request.is_completed) {
        actionsSection.innerHTML = `
            <button class="btn btn-success" onclick="completeRequest('${request.id}')">
                <i class="fas fa-check"></i> 완료
            </button>
            <button class="btn btn-danger" onclick="deleteRequest('${request.id}')">
                <i class="fas fa-trash"></i> 삭제
            </button>
        `;
    } else if (request.to_user_id === currentUser.id && (request.is_completed || request.status === 'rejected')) {
        actionsSection.innerHTML = `
            <button class="btn btn-danger" onclick="deleteRequest('${request.id}')">
                <i class="fas fa-trash"></i> 삭제
            </button>
        `;
      } else if (request.from_user_id === currentUser.id) {
        // 보낸 요청
        if (request.status === 'accepted' && !request.is_completed) {
            // 수락되었지만 완료 안 됨 -> 완료 + 삭제 버튼
            actionsSection.innerHTML = `
                <button class="btn btn-success" onclick="completeRequest('${request.id}')">
                    <i class="fas fa-check"></i> 완료
                </button>
                <button class="btn btn-danger" onclick="deleteRequest('${request.id}')">
                    <i class="fas fa-trash"></i> 삭제
                </button>
            `;
        } else {
            // 대기중, 거절됨, 완료됨 -> 삭제만 가능
            actionsSection.innerHTML = `
                <button class="btn btn-danger" onclick="deleteRequest('${request.id}')">
                    <i class="fas fa-trash"></i> 삭제
                </button>
            `;
        }
    } else {

        actionsSection.innerHTML = '';
    }
    document.getElementById('requestDetailModal').classList.add('active');
}

async function respondToRequest(requestId, status) {
    const message = prompt(status === 'accepted' ? 
        '수락 메시지를 입력하세요 (선택사항):' : 
        '거절 사유를 입력하세요 (선택사항):');
    if (message === null) return;
    showLoading();
    try {
        const updateData = {
            status: status,
            response_message: message || '',
            responded_at: new Date().toISOString()
        };
        const result = await supabaseFetch(`requests?id=eq.${requestId}`, {
            method: 'PATCH',
            body: JSON.stringify(updateData)
        });
        if (!result || result.length === 0) {
            throw new Error('업데이트된 요청을 찾을 수 없습니다.');
        }
        const updatedRequest = result[0];
        const index = allRequests.findIndex(r => r.id === requestId);
        if (index !== -1) {
            allRequests[index] = updatedRequest;
        }
        closeDetailModal();
        renderRequests();
        alert(status === 'accepted' ? '요청을 수락했습니다!' : '요청을 거절했습니다.');
    } catch (error) {
        console.error('요청 응답 오류:', error);
        alert('응답 중 오류가 발생했습니다: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function completeRequest(requestId) {
    if (!confirm('이 요청을 완료 처리하시겠습니까?')) {
        return;
    }
    showLoading();
    try {
        const updateData = {
            is_completed: true,
            completed_at: new Date().toISOString()
        };
        const result = await supabaseFetch(`requests?id=eq.${requestId}`, {
            method: 'PATCH',
            body: JSON.stringify(updateData)
        });
        if (!result || result.length === 0) {
            throw new Error('요청을 찾을 수 없습니다.');
        }
        const updatedRequest = result[0];
        const index = allRequests.findIndex(r => r.id === requestId);
        if (index !== -1) {
            allRequests[index] = updatedRequest;
        }
        closeDetailModal();
        renderRequests();
        alert('요청이 완료 처리되었습니다! ✅');
    } catch (error) {
        console.error('요청 완료 처리 오류:', error);
        alert('완료 처리 중 오류가 발생했습니다: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function deleteRequest(requestId) {
    if (!confirm('이 요청을 삭제하시겠습니까?')) {
        return;
    }
    showLoading();
    try {
        await supabaseFetch(`requests?id=eq.${requestId}`, {
            method: 'DELETE'
        });
        allRequests = allRequests.filter(r => r.id !== requestId);
        closeDetailModal();
        renderRequests();
        alert('요청이 삭제되었습니다.');
    } catch (error) {
        console.error('요청 삭제 오류:', error);
        alert('삭제 중 오류가 발생했습니다: ' + error.message);
    } finally {
        hideLoading();
    }
}

function closeRequestModal() {
    document.getElementById('requestModal').classList.remove('active');
}

function closeDetailModal() {
    document.getElementById('requestDetailModal').classList.remove('active');
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('페이지 로드 완료');
    console.log('이벤트 리스너 등록 중...');
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            if (currentUser) {
                logout();
            } else {
                const username = document.getElementById('usernameInput').value;
                login(username);
            }
        });
    }
    const usernameInput = document.getElementById('usernameInput');
    if (usernameInput) {
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                if (currentUser) {
                    logout();
                } else {
                    const username = document.getElementById('usernameInput').value;
                    login(username);
                }
            }
        });
    }
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
    const prevDateBtn = document.getElementById('prevDateBtn');
    const nextDateBtn = document.getElementById('nextDateBtn');
    const todayBtn = document.getElementById('todayBtn');
    if (prevDateBtn) prevDateBtn.addEventListener('click', () => changeDate(-1));
    if (nextDateBtn) nextDateBtn.addEventListener('click', () => changeDate(1));
    if (todayBtn) todayBtn.addEventListener('click', goToToday);
    const prevWeek = document.getElementById('prevWeek');
    const nextWeek = document.getElementById('nextWeek');
    if (prevWeek) prevWeek.addEventListener('click', () => changeWeek(-1));
    if (nextWeek) nextWeek.addEventListener('click', () => changeWeek(1));
    const addTaskBtn = document.getElementById('addTaskBtn');
    const newTaskInput = document.getElementById('newTaskInput');
    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', addTask);
    }
    if (newTaskInput) {
        newTaskInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addTask();
            }
        });
    }
    const newRequestBtn = document.getElementById('newRequestBtn');
    if (newRequestBtn) {
        newRequestBtn.addEventListener('click', openNewRequestModal);
        console.log('새 요청 버튼 이벤트 리스너 등록 완료');
    }
    const sendRequestBtn = document.getElementById('sendRequestBtn');
    const cancelRequestBtn = document.getElementById('cancelRequestBtn');
    if (sendRequestBtn) {
        sendRequestBtn.addEventListener('click', sendRequest);
    }
    if (cancelRequestBtn) {
        cancelRequestBtn.addEventListener('click', closeRequestModal);
    }
    const requestModal = document.getElementById('requestModal');
    if (requestModal) {
        requestModal.addEventListener('click', (e) => {
            if (e.target.id === 'requestModal') {
                closeRequestModal();
            }
        });
    }
    const requestDetailModal = document.getElementById('requestDetailModal');
    if (requestDetailModal) {
        requestDetailModal.addEventListener('click', (e) => {
            if (e.target.id === 'requestDetailModal') {
                closeDetailModal();
            }
        });
    }
    console.log('이벤트 리스너 등록 완료');
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            document.getElementById('currentUserName').textContent = currentUser.username;
            showScreen('mainScreen');
            loadAllData();
            updateDateDisplay();
            updatePageTitle();
            currentWeekStart = getWeekStart(new Date());
            updateWeekDisplay();
            checkAndMigrateTasks();
            deleteOldCompletedTasks();
            updateLoginButton(true);
            updateUserOnlineStatus(true);
        } catch (error) {
            console.error('자동 로그인 오류:', error);
            localStorage.removeItem('currentUser');
        }
    }
    setInterval(() => {
        if (currentUser) {
            loadAllData();
            checkAndMigrateTasks();
        }
    }, 30000);
    setInterval(() => {
        if (currentUser) {
            sendHeartbeat();
        }
    }, 60000);
    setInterval(() => {
        if (currentUser) {
            deleteOldCompletedTasks();
        }
    }, 3600000);
    window.addEventListener('beforeunload', () => {
        if (currentUser) {
            const url = `${SUPABASE_URL}/rest/v1/users?id=eq.${currentUser.id}`;
            const blob = new Blob([JSON.stringify({
                is_online: false,
                last_active_at: new Date().toISOString()
            })], { type: 'application/json' });
            navigator.sendBeacon(url, blob);
        }
    });
});
