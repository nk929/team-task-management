  1	// 전역 변수
     2	let currentUser = null;
     3	let currentDate = new Date();
     4	let currentWeekStart = null;
     5	let allTasks = [];
     6	let allUsers = [];
     7	let allRequests = [];
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
    26	function getWeekStart(date) {
    27	    const d = new Date(date);
    28	    const day = d.getDay();
    29	    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    30	    return new Date(d.setDate(diff));
    31	}
    32	
    33	function getWeekEnd(date) {
    34	    const start = getWeekStart(date);
    35	    const end = new Date(start);
    36	    end.setDate(start.getDate() + 6);
    37	    return end;
    38	}
    39	
    40	function formatWeekRange(startDate) {
    41	    const start = new Date(startDate);
    42	    const end = getWeekEnd(start);
    43	    const startMonth = start.getMonth() + 1;
    44	    const startDay = start.getDate();
    45	    const endMonth = end.getMonth() + 1;
    46	    const endDay = end.getDate();
    47	    if (startMonth === endMonth) {
    48	        return `${startMonth}월 ${startDay}일 ~ ${endDay}일`;
    49	    } else {
    50	        return `${startMonth}월 ${startDay}일 ~ ${endMonth}월 ${endDay}일`;
    51	    }
    52	}
    53	
    54	function updatePageTitle() {
    55	    const today = new Date();
    56	    const formattedDate = formatDateKorean(today);
    57	    document.title = `협업 업무 관리 - ${formattedDate}`;
    58	}
    59	
    60	function showLoading() {
    61	    const spinner = document.getElementById('loadingSpinner');
    62	    if (spinner) spinner.classList.remove('hidden');
    63	}
    64	
    65	function hideLoading() {
    66	    const spinner = document.getElementById('loadingSpinner');
    67	    if (spinner) spinner.classList.add('hidden');
    68	}
    69	
    70	function showScreen(screenId) {
    71	    document.querySelectorAll('.screen').forEach(screen => {
    72	        screen.classList.remove('active');
    73	    });
    74	    document.getElementById(screenId).classList.add('active');
    75	}
    76	
    77	async function login(username) {
    78	    if (!username || username.trim() === '') {
    79	        alert('사용자 이름을 입력해주세요.');
    80	        return;
    81	    }
    82	    showLoading();
    83	    try {
    84	        const users = await supabaseFetch('users?select=*&limit=1000');
    85	        let user;
    86	        const existingUser = users.find(u => u.username === username.trim());
    87	        if (existingUser) {
    88	            const now = new Date().toISOString();
    89	            const result = await supabaseFetch(`users?id=eq.${existingUser.id}`, {
    90	                method: 'PATCH',
    91	                body: JSON.stringify({
    92	                    is_online: true,
    93	                    last_active_at: now
    94	                })
    95	            });
    96	            user = result[0];
    97	        } else {
    98	            const now = new Date().toISOString();
    99	            const result = await supabaseFetch('users', {
   100	                method: 'POST',
