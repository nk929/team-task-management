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
    document.title = `협업 업무 관리 - ${formattedDate}`;
}

// 로딩 스피너 표시/숨김
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

// 로그인 처리
async function login(username) {
    if (!username || username.trim() === '') {
        alert('사용자 이름을 입력해주세요.');
        return;
    }

    showLoading();

    try {
        // 모든 사용자 조회 후 정확히 일치하는 사용자 찾기
        const response = await fetch('tables/users?limit=1000');
        const result = await response.json();
        
        let user;
        const existingUser = (result.data || []).find(u => u.username === username.trim());
        
        if (existingUser) {
            // 기존 사용자 - 온라인 상태 업데이트
            const updateResponse = await fetch(`tables/users/${existingUser.id}`, {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    is_online: true,
                    last_active_at: Date.now()
                })
            });
            user = await updateResponse.json();
        } else {
            // 새 사용자 생성
            const createResponse = await fetch('tables/users', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    username: username.trim(),
                    is_online: true,
                    last_active_at: Date.now(),
                    created_at: Date.now()
                })
            });
            user = await createResponse.json();
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
    document.getElementById('usernameInput').value = '';
    
    // 로그인 버튼 텍스트 변경
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
        
        // 입력창 숨기고 사용자 정보 표시
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
        
        // 사용자 정보 숨기고 입력창 표시
        usernameInput.style.display = 'block';
        loginUserInfo.style.display = 'none';
    }
}

// 사용자 온라인 상태 업데이트
async function updateUserOnlineStatus(isOnline) {
    if (!currentUser) return;
    
    try {
        await fetch(`tables/users/${currentUser.id}`, {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                is_online: isOnline,
                last_active_at: Date.now()
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
        await fetch(`tables/users/${currentUser.id}`, {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                is_online: true,
                last_active_at: Date.now()
            })
        });
    } catch (error) {
        console.error('하트비트 전송 오류:', error);
    }
}

// 사용자 온라인 여부 확인 (마지막 활동 시간 기준)
function isUserOnline(user) {
    if (!user.last_active_at) return false;
    const now = Date.now();
    const lastActive = user.last_active_at;
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
        const usersResponse = await fetch('tables/users?limit=1000');
        const usersResult = await usersResponse.json();
        allUsers = usersResult.data || [];
        console.log('사용자 수:', allUsers.length);

        // 모든 업무 로드
        console.log('업무 목록 로드 중...');
        const tasksResponse = await fetch('tables/tasks?limit=1000');
        const tasksResult = await tasksResponse.json();
        allTasks = tasksResult.data || [];
        console.log('업무 수:', allTasks.length);

        // 모든 요청사항 로드
        console.log('요청사항 목록 로드 중...');
        const requestsResponse = await fetch('tables/requests?limit=1000');
        const requestsResult = await requestsResponse.json();
        allRequests = requestsResult.data || [];
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
            created_at: Date.now()
        };

        const response = await fetch('tables/tasks', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(taskData)
        });

        const newTask = await response.json();
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
            completed_at: !task.is_completed ? Date.now() : null
        };

        const response = await fetch(`tables/tasks/${taskId}`, {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(updateData)
        });

        const updatedTask = await response.json();
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

        const response = await fetch(`tables/tasks/${taskId}`, {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(updateData)
        });

        const updatedTask = await response.json();
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
        await fetch(`tables/tasks/${taskId}`, {
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

    // 팀 공유 업무 렌더링
    const sharedTasks = allTasks.filter(t => 
        t.is_shared && !t.is_completed && t.task_date === selectedDate
    );
    renderTeamSharedTasks(sharedTasks);
    document.getElementById('sharedTaskCount').textContent = `${sharedTasks.length}개`;

    // 팀원별 완료 업무 렌더링
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

    // 사용자별로 그룹화
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

// 팀원별 완료 업무 렌더링 (주간 단위)
function renderTeamCompletedTasks() {
    const container = document.getElementById('teamCompletedTasks');
    
    // 주간 범위 계산
    const weekStart = formatDate(currentWeekStart);
    const weekEnd = formatDate(getWeekEnd(currentWeekStart));
    
    // 다른 팀원들의 완료된 업무 (공유+완료, 주간 범위 내)
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

    // 사용자별로 그룹화
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
        
        // 날짜별로 그룹화
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

            const response = await fetch(`tables/tasks/${task.id}`, {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(updateData)
            });

            const updatedTask = await response.json();
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
                await fetch(`tables/tasks/${task.id}`, {
                    method: 'DELETE'
                });
                
                // 로컬 배열에서도 제거
                const index = allTasks.findIndex(t => t.id === task.id);
                if (index !== -1) {
                    allTasks.splice(index, 1);
                }
                
                // 삭제 속도 조절 (서버 부하 방지)
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

// ============ 요청사항 관련 함수 ============

// 요청사항 렌더링
function renderRequests() {
    // 받은 요청
    const receivedRequests = allRequests.filter(r => r.to_user_id === currentUser.id);
    const unreadReceived = receivedRequests.filter(r => !r.is_read);
    renderRequestList('receivedRequests', receivedRequests);
    document.getElementById('receivedRequestBadge').textContent = unreadReceived.length;
    
    // 보낸 요청
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
    
    // 최신순 정렬
    requests.sort((a, b) => b.created_at - a.created_at);
    
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
        
        // 온라인 상태 확인
        const targetUser = containerId === 'receivedRequests' ? fromUser : toUser;
        const isOnline = targetUser ? isUserOnline(targetUser) : false;
        
        // 읽음 상태 (받은 요청만)
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

// 새 요청 모달 열기
function openNewRequestModal() {
    // 사용자 목록 업데이트 (온라인 상태 포함)
    const userSelect = document.getElementById('requestToUser');
    const otherUsers = allUsers.filter(u => u.id !== currentUser.id);
    
    // 온라인 사용자 먼저, 오프라인 사용자 나중에
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
    
    // 입력 필드 초기화
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
            created_at: Date.now()
        };
        
        const response = await fetch('tables/requests', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(requestData)
        });
        
        const newRequest = await response.json();
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
            const response = await fetch(`tables/requests/${requestId}`, {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    is_read: true,
                    read_at: Date.now()
                })
            });
            
            const updatedRequest = await response.json();
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
    const fromUserName = fromUser ? fromUser.username : '알 수 없음';
    const toUserName = toUser ? toUser.username : '알 수 없음';
    
    // 온라인 상태
    const fromUserOnline = fromUser ? isUserOnline(fromUser) : false;
    const toUserOnline = toUser ? isUserOnline(toUser) : false;
    
    const statusText = {
        'pending': '대기중',
        'accepted': '수락됨',
        'rejected': '거절됨'
    }[request.status] || '알 수 없음';
    
    const detailContent = document.getElementById('requestDetailContent');
    detailContent.innerHTML = `
        <div class="request-detail-info">
            <p>
                <strong>보낸 사람:</strong> 
                <span class="user-status">
                    <span class="status-dot ${fromUserOnline ? 'online' : 'offline'}"></span>
                    ${escapeHtml(fromUserName)}
                    <span class="status-text ${fromUserOnline ? 'online' : 'offline'}">
                        (${fromUserOnline ? '온라인' : '오프라인'})
                    </span>
                </span>
            </p>
            <p>
                <strong>받는 사람:</strong> 
                <span class="user-status">
                    <span class="status-dot ${toUserOnline ? 'online' : 'offline'}"></span>
                    ${escapeHtml(toUserName)}
                    <span class="status-text ${toUserOnline ? 'online' : 'offline'}">
                        (${toUserOnline ? '온라인' : '오프라인'})
                    </span>
                </span>
            </p>
            <p><strong>상태:</strong> <span class="request-status ${request.status}">${statusText}</span></p>
            <p><strong>요청 시간:</strong> ${new Date(request.created_at).toLocaleString('ko-KR')}</p>
            ${request.is_read && request.read_at ? `<p><strong>읽은 시간:</strong> ${new Date(request.read_at).toLocaleString('ko-KR')}</p>` : ''}
            ${request.responded_at ? `<p><strong>응답 시간:</strong> ${new Date(request.responded_at).toLocaleString('ko-KR')}</p>` : ''}
        </div>
        
        <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">${escapeHtml(request.title)}</h3>
        <p style="line-height: 1.6; color: var(--text-primary); margin-bottom: 16px;">${escapeHtml(request.message)}</p>
        
        ${request.response_message ? `
            <div class="response-area">
                <h4><i class="fas fa-reply"></i> 응답 내용</h4>
                <p style="line-height: 1.6;">${escapeHtml(request.response_message)}</p>
            </div>
        ` : ''}
    `;
    
    const detailFooter = document.getElementById('requestDetailFooter');
    
    // 받은 요청이고 대기중인 경우 응답 버튼 표시
    if (request.to_user_id === currentUser.id && request.status === 'pending') {
        detailFooter.innerHTML = `
            <button class="secondary-btn" onclick="respondToRequest('${request.id}', 'rejected')">
                <i class="fas fa-times"></i> 거절
            </button>
            <button class="primary-btn" onclick="respondToRequest('${request.id}', 'accepted')">
                <i class="fas fa-check"></i> 수락
            </button>
        `;
    } else {
        detailFooter.innerHTML = `
            <button class="secondary-btn" onclick="closeDetailModal()">닫기</button>
        `;
    }
    
    document.getElementById('requestDetailModal').classList.add('active');
}

// 요청 응답
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
            responded_at: Date.now()
        };
        
        const response = await fetch(`tables/requests/${requestId}`, {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(updateData)
        });
        
        const updatedRequest = await response.json();
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

// 이벤트 리스너 설정
document.addEventListener('DOMContentLoaded', () => {
    console.log('페이지 로드 완료');
    console.log('이벤트 리스너 등록 중...');
    
    // 로그인/로그아웃 버튼
    document.getElementById('loginBtn').addEventListener('click', () => {
        if (currentUser) {
            // 로그아웃
            logout();
        } else {
            // 로그인
            const username = document.getElementById('usernameInput').value;
            login(username);
        }
    });

    // 로그인 입력 엔터키
    document.getElementById('usernameInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            if (currentUser) {
                logout();
            } else {
                const username = document.getElementById('usernameInput').value;
                login(username);
            }
        }
    });

    // 로그아웃 버튼 (헤더)
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // 날짜 네비게이션
    document.getElementById('prevDateBtn').addEventListener('click', () => changeDate(-1));
    document.getElementById('nextDateBtn').addEventListener('click', () => changeDate(1));
    document.getElementById('todayBtn').addEventListener('click', goToToday);

    // 주간 네비게이션
    document.getElementById('prevWeekBtn').addEventListener('click', () => changeWeek(-1));
    document.getElementById('nextWeekBtn').addEventListener('click', () => changeWeek(1));
    document.getElementById('thisWeekBtn').addEventListener('click', goToThisWeek);

    // 업무 추가
    document.getElementById('addTaskBtn').addEventListener('click', () => {
        const title = document.getElementById('newTaskInput').value;
        addTask(title);
    });

    document.getElementById('newTaskInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const title = document.getElementById('newTaskInput').value;
            addTask(title);
        }
    });

    // 요청사항 관련
    document.getElementById('newRequestBtn').addEventListener('click', openNewRequestModal);
    document.getElementById('sendRequestBtn').addEventListener('click', sendRequest);
    document.getElementById('cancelRequestBtn').addEventListener('click', closeRequestModal);
    document.getElementById('closeRequestModal').addEventListener('click', closeRequestModal);
    document.getElementById('closeDetailModal').addEventListener('click', closeDetailModal);
    
    // 모달 외부 클릭 시 닫기
    document.getElementById('requestModal').addEventListener('click', (e) => {
        if (e.target.id === 'requestModal') closeRequestModal();
    });
    document.getElementById('requestDetailModal').addEventListener('click', (e) => {
        if (e.target.id === 'requestDetailModal') closeDetailModal();
    });

    // 페이지 타이틀 초기 설정
    updatePageTitle();
    // 타이틀을 매일 자정에 업데이트
    setInterval(updatePageTitle, 60000); // 1분마다 체크

    // 자동 로그인 (저장된 세션이 있을 경우)
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            document.getElementById('currentUserName').textContent = currentUser.username;
            showScreen('mainScreen');
            
            // 주간 조회 초기화
            currentWeekStart = getWeekStart(new Date());
            updateWeekDisplay();
            
            // 로그인 버튼 텍스트 업데이트
            updateLoginButton(true);
            
            loadAllData();
            updateDateDisplay();
            updatePageTitle();
            checkAndMigrateTasks();
            deleteOldCompletedTasks();
        } catch (error) {
            console.error('자동 로그인 오류:', error);
            localStorage.removeItem('currentUser');
            updateLoginButton(false);
        }
    }

    // 주기적으로 데이터 갱신 (30초마다)
    setInterval(() => {
        if (currentUser) {
            loadAllData();
            checkAndMigrateTasks();
        }
    }, 30000);

    // 하트비트 전송 (1분마다)
    setInterval(() => {
        if (currentUser) {
            sendHeartbeat();
        }
    }, 60000); // 1분

    // 매일 자정에 오래된 완료 업무 삭제 (1시간마다 체크)
    setInterval(() => {
        if (currentUser) {
            deleteOldCompletedTasks();
        }
    }, 3600000); // 1시간
    
    // 페이지를 떠날 때 오프라인 상태로 변경
    window.addEventListener('beforeunload', () => {
        if (currentUser) {
            // 동기식으로 오프라인 상태 전송 (비동기는 보장 안 됨)
            navigator.sendBeacon(`tables/users/${currentUser.id}`, JSON.stringify({
                is_online: false,
                last_active_at: Date.now()
            }));
        }
    });
});

