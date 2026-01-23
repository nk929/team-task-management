 1	// 전역 변수
     2	let currentUser = null;
     3	let currentDate = new Date();
     4	let currentWeekStart = null; // 주간 조회 시작일
     5	let allTasks = [];
     6	let allUsers = [];
     7	let allRequests = []; // 모든 요청사항
     8	
     9	// 날짜 포맷 함수
    10	function formatDate(date) {
    11	    const year = date.getFullYear();
    12	    const month = String(date.getMonth() + 1).padStart(2, '0');
    13	    const day = String(date.getDate()).padStart(2, '0');
    14	    return `${year}-${month}-${day}`;
    15	}
    16	
    17	function formatDateKorean(date) {
    18	    const year = date.getFullYear();
    19	    const month = date.getMonth() + 1;
    20	    const day = date.getDate();
    21	    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    22	    const weekday = weekdays[date.getDay()];
    23	    return `${year}년 ${month}월 ${day}일 (${weekday})`;
    24	}
    25	
    26	// 주의 시작일(월요일) 계산
    27	function getWeekStart(date) {
    28	    const d = new Date(date);
    29	    const day = d.getDay();
    30	    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 월요일로 조정
    31	    return new Date(d.setDate(diff));
    32	}
    33	
    34	// 주의 끝일(일요일) 계산
    35	function getWeekEnd(date) {
    36	    const start = getWeekStart(date);
    37	    const end = new Date(start);
    38	    end.setDate(start.getDate() + 6);
    39	    return end;
    40	}
    41	
    42	// 주간 범위 포맷
    43	function formatWeekRange(startDate) {
    44	    const start = new Date(startDate);
    45	    const end = getWeekEnd(start);
    46	    
    47	    const startMonth = start.getMonth() + 1;
    48	    const startDay = start.getDate();
    49	    const endMonth = end.getMonth() + 1;
    50	    const endDay = end.getDate();
    51	    
    52	    if (startMonth === endMonth) {
    53	        return `${startMonth}월 ${startDay}일 ~ ${endDay}일`;
    54	    } else {
    55	        return `${startMonth}월 ${startDay}일 ~ ${endMonth}월 ${endDay}일`;
    56	    }
    57	}
    58	
    59	// 페이지 타이틀 업데이트
    60	function updatePageTitle() {
    61	    const today = new Date();
    62	    const formattedDate = formatDateKorean(today);
    63	    document.title = `협업 업무 관리 - ${formattedDate}`;
    64	}
    65	
    66	// 로딩 스피너 표시/숨김
    67	function showLoading() {
    68	    document.getElementById('loadingSpinner').classList.add('active');
    69	}
    70	
    71	function hideLoading() {
    72	    document.getElementById('loadingSpinner').classList.remove('active');
    73	}
    74	
    75	// 화면 전환
    76	function showScreen(screenId) {
    77	    document.querySelectorAll('.screen').forEach(screen => {
    78	        screen.classList.remove('active');
    79	    });
    80	    document.getElementById(screenId).classList.add('active');
    81	}
    82	
    83	// 로그인 처리
    84	async function login(username) {
    85	    if (!username || username.trim() === '') {
    86	        alert('사용자 이름을 입력해주세요.');
    87	        return;
    88	    }
    89	
    90	    showLoading();
    91	
    92	    try {
    93	        // 모든 사용자 조회 후 정확히 일치하는 사용자 찾기
    94	        const users = await supabaseFetch('users?select=*&limit=1000');
    95	        
    96	        let user;
    97	        const existingUser = users.find(u => u.username === username.trim());
    98	        
    99	        if (existingUser) {
   100	            // 기존 사용자 - 온라인 상태 업데이트
