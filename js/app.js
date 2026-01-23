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
        alert('업무 추가 중 오류가<span class="cursor">█</span>
