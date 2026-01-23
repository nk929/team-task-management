// 전역 변수
let currentUser = null;
let currentDate = new Date();
let currentWeekStart = null; // 주간 조회 시작일
let allTasks = [];
let allUsers = [];
let allRequests = []; // 모든 요청사항

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
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 월요일로 조정
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
    document.title = `${formattedDate} - 협업 업무 관리`;
}

// 로딩 스피너
function showLoading() {
    document.getElementById('loadingSpinner').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loadingSpinner').classList.add('hidden');
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
        // 모든 사용자 조회 후 정확히 일치하는 사용자 찾기
        const users = await supabaseFetch('users?select=*&limit=1000');
        
        let user;
        const existingUser = users.find(u => u.username === username.trim());
        
        if (existingUser) {
            // 기존 사용자 - 온라인 상태 업데이트
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
            // 새 사용자 생성
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
        
        // 초기 데이터 로드
        await loadAllData();
        updateDateDisplay();
        updatePageTitle();
        
        // 주간 조회 초기화 (이번 주로 설정)
        currentWeekStart = getWeekStart(new Date());
        updateWeekDisplay();
        
        await checkAndMigrateTasks();
        await deleteOldCompletedTasks();
        
        // 로그인 버튼 텍스트 변경
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
    // 오프라인 상태로 업데이트
    if (currentUser) {
        updateUserOnlineStatus(false);
    }
    
    currentUser = null;
    localStorage.removeItem('currentUser');
    showScreen('loginScreen');
    
    // 로그인 버튼 텍스트 변경
    updateLoginButton(false);
}

// 로그인 버튼 텍스트 업데이트
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

// 사용자 온라인 상태 업데이트
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

// 하트비트 - 주기적으로 온라인 상태 갱신
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

// 사용자 온라인 여부 확인 (마지막 활동 시간 기준)
function isUserOnline(user) {
    if (!user.last_active_at) return false;
    const now = new Date();
    const lastActive = new Date(user.last_active_at);
    const timeDiff = now - lastActive;
    // 2분 이내 활동이 있으면 온라인으로 간주
    return timeDiff < 120000;
}

// 모든 데이터 로드
async function loadAllData() {
    console.log('데이터 로드 시작...');
    showLoading();
    try {
        // 모든 사용자 로드
        console.log('사용자 목록 로드 중...');
        allUsers = await supabaseFetch('users?select=*&limit=1000');
        console.log('사용자 수:', allUsers.length);

        // 모든 업무 로드
        console.log('업무 목록 로드 중...');
        allTasks = await supabaseFetch('tasks?select=*&limit=1000');
        console.log('업무 수:', allTasks.length);

        // 모든 요청사항 로드
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
    renderAllTasks();
}

function updateWeekDisplay() {
    document.getElementById('currentWeek').textContent = formatWeekRange(currentWeekStart);
}

// 업무 추가
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
        alert('업무 공유 설정 중 오류가 발생했습니다.');
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
    
    // 내 업무 필터링
    const myTasks = allTasks.filter(t => 
        t.user_id === currentUser.id && t.task_date === selectedDate
    );
    
    const myPending = myTasks.filter(t => !t.is_completed);
    const myCompleted = myTasks.filter(t => t.is_completed);

    // 내 업무 렌더링
    renderMyTasks('myPendingTasks', myPending, true);
    renderMyTasks('myCompletedTasks', myCompleted, true);
    document.getElementById('myTaskCount').textContent = `${myTasks.length}개`;

    // 팀 공유 업무 (다른 사람이 공유한 미완료 업무)
    const teamSharedTasks = allTasks.filter(t => 
        t.user_id !== currentUser.id && 
        t.is_shared && 
        !t.is_completed &&
        t.task_date === selectedDate
    );
    renderTeamSharedTasks('teamSharedTasks', teamSharedTasks);
    document.getElementById('teamSharedCount').textContent = `${teamSharedTasks.length}개`;

    // 팀원별 완료 업무 (주간 조회)
    const weekStart = formatDate(getWeekStart(currentWeekStart));
    const weekEnd = formatDate(getWeekEnd(currentWeekStart));
    
    const teamCompletedTasks = allTasks.filter(t => 
        t.user_id !== currentUser.id && 
        t.is_completed &&
        t.task_date >= weekStart &&
        t.task_date <= weekEnd
    );
    renderTeamCompletedTasks('teamCompletedTasks', teamCompletedTasks);
    document.getElementById('teamCompletedCount').textContent = `${teamCompletedTasks.length}개`;
}

// 내 업무 렌더링
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

// 팀 공유 업무 렌더링
function renderTeamSharedTasks(elementId, tasks) {
    const container = document.getElementById(elementId);
    if (tasks.length === 0) {
        container.innerHTML = '<div class="empty-message">공유된 업무가 없습니다</div>';
        return;
    }

    // 사용자별로 그룹화
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

// 팀원별 완료 업무 렌더링
function renderTeamCompletedTasks(elementId, tasks) {
    const container = document.getElementById(elementId);
    if (tasks.length === 0) {
        container.innerHTML = '<div class="empty-message">완료된 업무가 없습니다</div>';
        return;
    }

    // 사용자별로 그룹화
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

// 날짜가 지난 미완료 업무를 오늘로 이관
async function checkAndMigrateTasks() {
    const today = formatDate(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    try {
        // 오늘 이전의 미완료 업무 찾기
        const oldTasks = allTasks.filter(t => 
            t.user_id === currentUser.id &&
            !t.is_completed && 
            t.task_date < today
        );

        if (oldTasks.length === 0) return;

        // 각 업무를 오늘 날짜로 업데이트
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

// 6개월 이상 완료된 업무 삭제
async function deleteOldCompletedTasks() {
    try {
        // 6개월 전 날짜 계산
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const cutoffDate = formatDate(sixMonthsAgo);
        
        // 6개월 이전에 완료된 업무 찾기
        const oldCompletedTasks = allTasks.filter(t => 
            t.is_completed && 
            t.task_date < cutoffDate
        );

        if (oldCompletedTasks.length === 0) {
            console.log('삭제할 오래된 완료 업무가 없습니다.');
            return;
        }

        console.log(`${oldCompletedTasks.length}개의 6개월 이상 완료된 업무를 삭제합니다...`);

        // 순차적으로 삭제
        for (const task of oldCompletedTasks) {
            try {
                await supabaseFetch(`tasks?id=eq.${task.id}`, {
                    method: 'DELETE'
                });
                
                // 로컬 배열에서도 제거
                const index = allTasks.findIndex(t => t.id === task.id);
                if (index !== -1) {
                    allTasks.splice(index, 1);
                }
                
                // 각 삭제 사이에 약간의 지연
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

// 요청사항 렌더링
function renderRequests() {
    // 받은 요청 (to_user_id가 현재 사용자)
    const receivedRequests = allRequests.filter(r => 
        r.to_user_id === currentUser.id
    );
    
    // 보낸 요청 (from_user_id가 현재 사용자)
    const sentRequests = allRequests.filter(r => 
        r.from_user_id === currentUser.id
    );
    
    renderRequestList('receivedRequests', receivedRequests, 'received');
    renderRequestList('sentRequests', sentRequests, 'sent');
    
    document.getElementById('receivedCount').textContent = `${receivedRequests.length}개`;
    document.getElementById('sentCount').textContent = `${sentRequests.length}개`;
}

// 요청사항 목록 렌더링
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
            statusBadge = '<span class="badge badge-accepted">수락됨</span>';
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

// 새 요청 모달 열기
function openNewRequestModal() {
    const modal = document.getElementById('requestModal');
    const toUserSelect = document.getElementById('toUserSelect');
    
    // 다른 사용자 목록 생성
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

// 요청 전송
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

// 요청 상세 보기
async function showRequestDetail(requestId) {
    const request = allRequests.find(r => r.id === requestId);
    if (!request) return;
    
    // 받은 요청이고 읽지 않은 경우 읽음 처리
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
            
            // 읽음 처리 후 목록 다시 렌더링
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
    document.getElementById('detailStatus').textContent = 
        request.status === 'pending' ? '대기중' :
        request.status === 'accepted' ? '수락됨' : '거절됨';
    
    const responseSection = document.getElementById('detailResponse');
    if (request.response_message) {
        responseSection.innerHTML = `<strong>응답:</strong> ${request.response_message}`;
    } else {
        responseSection.innerHTML = '';
    }
    
    const actionsSection = document.getElementById('detailActions');
    
    // 받은 요청이고 대기중인 경우 -> 수락/거절 버튼
    if (request.to_user_id === currentUser.id && request.status === 'pending') {
        actionsSection.innerHTML = `
            <button class="btn btn-primary" onclick="respondToRequest('${request.id}', 'accepted')">수락</button>
            <button class="btn btn-secondary" onclick="respondToRequest('${request.id}', 'rejected')">거절</button>
        `;
    }
    // 보낸 요청인 경우 -> 항상 삭제 가능
    else if (request.from_user_id === currentUser.id) {
        actionsSection.innerHTML = `
            <button class="btn btn-danger" onclick="deleteRequest('${request.id}')">
                <i class="fas fa-trash"></i> 삭제
            </button>
        `;
    }
    // 받은 요청이고 이미 응답한 경우 -> 삭제 가능
    else if (request.to_user_id === currentUser.id && request.status !== 'pending') {
        actionsSection.innerHTML = `
            <button class="btn btn-danger" onclick="deleteRequest('${request.id}')">
                <i class="fas fa-trash"></i> 삭제
            </button>
        `;
    }
    // 그 외의 경우 (발생하지 않아야 함)
    else {
        actionsSection.innerHTML = '';
    }
    
    document.getElementById('requestDetailModal').classList.add('active');

}

// 요청에 응답
async function respondToRequest(requestId, status) {
    const message = prompt(status === 'accepted' ? 
        '수락 메시지를 입력하세요 (선택사항):' : 
        '거절 사유를 입력하세요 (선택사항):');
    
    if (message === null) return; // 취소
    
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
        alert('응답 중 오류가 발생했습니다.');
    } finally {
        hideLoading();
    }
}

// 모달 닫기
function closeRequestModal() {
    document.getElementById('requestModal').classList.remove('active');
}

function closeDetailModal() {
    document.getElementById('requestDetailModal').classList.remove('active');
}

// 요청 삭제
async function deleteRequest(requestId) {
    if (!confirm('이 요청을 삭제하시겠습니까?')) {
        return;
    }
    
    showLoading();
    try {
        console.log('요청 삭제 시작:', requestId);
        
        await supabaseFetch(`requests?id=eq.${requestId}`, {
            method: 'DELETE'
        });
        
        // 로컬 배열에서 제거
        allRequests = allRequests.filter(r => r.id !== requestId);
        
        // UI 업데이트
        closeDetailModal();
        renderRequests();
        
        console.log('요청 삭제 완료');
        alert('요청이 삭제되었습니다.');
        
    } catch (error) {
        console.error('요청 삭제 오류:', error);
        alert('삭제 중 오류가 발생했습니다: ' + error.message);
    } finally {
        hideLoading();
    }
}

// 이벤트 리스너 설정
document.addEventListener('DOMContentLoaded', () => {

    console.log('페이지 로드 완료');
    console.log('이벤트 리스너 등록 중...');
    
    // 로그인/로그아웃 버튼
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

    // 로그인 입력 엔터키
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

    // 로그아웃 버튼 (헤더)
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    // 날짜 네비게이션
    const prevDateBtn = document.getElementById('prevDateBtn');
    const nextDateBtn = document.getElementById('nextDateBtn');
    const todayBtn = document.getElementById('todayBtn');
    
    if (prevDateBtn) prevDateBtn.addEventListener('click', () => changeDate(-1));
    if (nextDateBtn) nextDateBtn.addEventListener('click', () => changeDate(1));
    if (todayBtn) todayBtn.addEventListener('click', goToToday);

    // 주간 네비게이션
    const prevWeek = document.getElementById('prevWeek');
    const nextWeek = document.getElementById('nextWeek');
    
    if (prevWeek) prevWeek.addEventListener('click', () => changeWeek(-1));
    if (nextWeek) nextWeek.addEventListener('click', () => changeWeek(1));

    // 업무 추가
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

    // 새 요청 버튼
    const newRequestBtn = document.getElementById('newRequestBtn');
    if (newRequestBtn) {
        newRequestBtn.addEventListener('click', openNewRequestModal);
        console.log('새 요청 버튼 이벤트 리스너 등록 완료');
    } else {
        console.warn('새 요청 버튼을 찾을 수 없습니다');
    }
    
    // 요청 모달 버튼들
    const sendRequestBtn = document.getElementById('sendRequestBtn');
    const cancelRequestBtn = document.getElementById('cancelRequestBtn');
    
    if (sendRequestBtn) {
        sendRequestBtn.addEventListener('click', sendRequest);
    }
    
    if (cancelRequestBtn) {
        cancelRequestBtn.addEventListener('click', closeRequestModal);
    }
    
    // 모달 배경 클릭으로 닫기
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

    // 자동 로그인 체크
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            document.getElementById('currentUserName').textContent = currentUser.username;
            showScreen('mainScreen');
            loadAllData();
            updateDateDisplay();
            updatePageTitle();
            
            // 주간 조회 초기화
            currentWeekStart = getWeekStart(new Date());
            updateWeekDisplay();
            
            checkAndMigrateTasks();
            deleteOldCompletedTasks();
            
            // 로그인 버튼 텍스트 변경
            updateLoginButton(true);
            
            // 온라인 상태 업데이트
            updateUserOnlineStatus(true);
        } catch (error) {
            console.error('자동 로그인 오류:', error);
            localStorage.removeItem('currentUser');
        }
    }

    // 30초마다 데이터 동기화
    setInterval(() => {
        if (currentUser) {
            loadAllData();
            checkAndMigrateTasks();
        }
    }, 30000);

    // 60초마다 하트비트 전송
    setInterval(() => {
        if (currentUser) {
            sendHeartbeat();
        }
    }, 60000);

    // 1시간마다 오래된 완료 업무 삭제
    setInterval(() => {
        if (currentUser) {
            deleteOldCompletedTasks();
        }
    }, 3600000);
    
    // 페이지를 떠날 때 오프라인 상태로 변경
    window.addEventListener('beforeunload', () => {
        if (currentUser) {
            // 동기식으로 오프라인 상태 전송
            const url = `${SUPABASE_URL}/rest/v1/users?id=eq.${currentUser.id}`;
            const blob = new Blob([JSON.stringify({
                is_online: false,
                last_active_at: new Date().toISOString()
            })], { type: 'application/json' });
            
            navigator.sendBeacon(url, blob);
        }
    });
});
