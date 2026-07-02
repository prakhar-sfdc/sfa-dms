import { LightningElement, track, wire } from 'lwc';
import USER_ID from '@salesforce/user/Id';
import { getRecord } from 'lightning/uiRecordApi';
import NAME_FIELD from '@salesforce/schema/User.Name';
import PROFILE_NAME_FIELD from '@salesforce/schema/User.Profile.Name';
import handleCheckIn from '@salesforce/apex/AttendanceLWCController.handleCheckIn';
import handleCheckOut from '@salesforce/apex/AttendanceLWCController.handleCheckOut';
import getTodayAttendance from '@salesforce/apex/AttendanceLWCController.getTodayAttendance';
import getRecentAttendance from '@salesforce/apex/AttendanceLWCController.getRecentAttendance';
import getLast7DayCompliance from '@salesforce/apex/AttendanceLWCController.getLast7DayCompliance';
import getVisitCountsByDates from '@salesforce/apex/VisitDayPlanController.getVisitCountsByDates';
import getDayPlan from '@salesforce/apex/VisitDayPlanController.getDayPlan';
import getFieldForceAIInsights from '@salesforce/apex/FieldForceAIController.getFieldForceAIInsights';
import getDayVisits from '@salesforce/apex/VisitDayVisitsController.getDayVisits';
import getMonthPlan from '@salesforce/apex/VisitMonthPlanController.getMonthPlan';
import getWeekVisits from '@salesforce/apex/VisitWeekPlanController.getWeekVisits';
import getExpenseSummary from '@salesforce/apex/ExpenseController.getExpenseSummary';
import getBudgetSummary from '@salesforce/apex/ExpenseController.getBudgetSummary';
import getRecentExpenses from '@salesforce/apex/ExpenseController.getRecentExpenses';
import getAllExpenses from '@salesforce/apex/ExpenseController.getAllExpenses';
import createAccount from '@salesforce/apex/AccountOnboardingController.createAccount';
import getDashboardData from '@salesforce/apex/DashboardController.getDashboardData';
import getAttendanceLast14Days from '@salesforce/apex/AttendanceLWCController.getAttendanceLast14Days';
import getLast14DaysVisits from '@salesforce/apex/VisitDayVisitsController.getLast14DaysVisits';
import getDashboardAttendanceCompliance from '@salesforce/apex/AttendanceLWCController.getDashboardAttendanceCompliance';
import getPriorityAccounts from '@salesforce/apex/PriorityAccountController.getPriorityAccounts';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import createVisit from '@salesforce/apex/VisitDayVisitsController.createVisit';
import checkInVisit from '@salesforce/apex/VisitDayVisitsController.checkInVisit';



export default class DashboardComponent extends LightningElement {
    @track attendanceRecordId;
    @track activeTab = 'dashboard';
    @track visitHistoryFilter = 'all';
    @track currentDate = '';
    @track currentTime = '';
    @track gpsCoordinates = 'Click "Get My Location" to capture';
    @track currentAddress = 'Location not captured yet';
    @track attendanceStatus = 'Not Checked In';
    @track isCheckedIn = false;
    @track checkInTime = null;
    @track currentDuration = '00:00:00';

    @track showAllAttendance = false;
    @track allAttendance = [];
    @track isAttendanceLoading = false;
    @track selectedAttendance = {};
    @track locationUpdateTime = '';
    @track currentLatitude = null;
    @track currentLongitude = null;
    @track locationAccuracy = null;
    @track mapMarkers = [];
    @track checkInMapMarkers = [];
    @track checkOutMapMarkers = [];
    @track zoomLevel = 15;
    @track showCalendar = false;
    @track selectedView = 'day';
    @track selectedDate = new Date();
    @track calendarMonth = '';
    @track calendarYear = '';
    @track calendarDays = [];
    @track carouselDates = [];
    @track showSuccessState = false;
    @track isSubmitting = false;
    @track formData = {
        businessName: '',
        accountType: '',
        gstin: '',
        contactPerson: '',
        phoneNumber: '',
        email: '',
        streetAddress: '',
        city: '',
        state: '',
        country: '',
        pincode: ''
    };

    @track showExpenseSubmitModal = false;
    @track errors = {};
    @track isAILoading = false;
    @track aiLoadError = '';
    @track isGeneratingInsights = false;
    @track lastRefreshTime = null;
    @track aiStatus = "active";
    showVisitHistoryModal = false;
    allVisits = [];
    @track priorityAccountsJP = [];
    userName;
    userRole;


    @track weeklyData = [];
    @track weekStats = {
        days: '7',
        totalVisits: '0',
        completedVisits: '0',
        totalHours: '0h'
    };

    @track monthDays = [];
    @track monthStats = {
        days: 30,
        totalVisits: 0,
        accounts: 45
    };

    @track monthSummary = {
        totalDays: 0,
        totalVisits: 0,
        totalAccounts: 0
    };

    @track monthCalendarData = {}; // key = yyyy-MM-dd

    @track weekSchedule = [];
    @track weekRangeDisplay = '';

    //@track carouselDates = [];
    @track todayProgress = {
        planned: 0,
        completed: 0,
        pending: 0,
        successRate: 0
    };

    @track activeVisitId = null;
    @track activeVisitCheckInTime = null;
    @track activeVisitLat = null;
    @track activeVisitLng = null;
    @track activeVisitAddress = '';
    @track checkingInVisitId = null;

    today = new Date();
    @track carouselStartDate = new Date(); // controls window only
    @track dailyVisits = [];

    expenseSummary = {
        totalAmount: 0,
        approvedCount: 0,
        pendingCount: 0,
        totalSubmissions: 0
    };

    @track budget = {
        total: 0,
        used: 0,
        remaining: 0,
        usedPercent: 0,
        status: ''
    };

    @track recentExpenses = [];
    @track isExpenseLoading = false;
    @track showExpenseModal = false;
    @track selectedExpense = {};
    @track showAllExpenses = false;
    @track allExpenses = [];

    @track dayStats = {
        plannedVisits: 0,
        estimatedDuration: '—',
        completedToday: 0
    };
    @track attendanceComplianceSummary = {
        compliancePercent: 0,
        presentDays: 0,
        totalDays: 0,
        onTimeDays: 0
    };

    dashboardLoaded = false;
    attendancePresentText = '';
    attendanceOnTimeText = '';


    recentVisits = [];
    todayVisits = 0;
    monthVisits = 0;
    activeDealers = 0;
    totalAccounts = 0;
    @track awaitingApproval = 0;
    @track priorityAccounts = [];

    @track showScheduleVisitModal = false;
    @track selectedAccountId = null;
    @track selectedAccountName = '';

    @track visitForm = {
        visitDate: '',
        plannedStartTime: ''
    };


    // All tabs
    tabs = [
        { id: 'dashboard', label: 'Dashboard', icon: '📊' },
        { id: 'attendance', label: 'Attendance', icon: '🕐' },
        { id: 'journey-plan', label: 'Journey Plan', icon: '🗺️' },
        { id: 'visit-execution', label: 'Visit Execution', icon: '✓' },
        { id: 'expenses', label: 'Expenses', icon: '💰' },
        { id: 'primary-orders', label: 'Primary Orders', icon: '📦' },
        { id: 'new-account', label: 'New Account', icon: '➕' },
        { id: 'account-360', label: 'Account 360', icon: '🔄' },
        { id: 'ai-analytics', label: 'AI & Analytics', icon: '🤖' }
    ];

    // AI Analytics Data
    @track aiData = {
        kpis: [
            {
                id: 1,
                title: "Monthly Sales",
                value: "₹12.4L",
                target: "₹15L",
                achievement: "82%",
                trend: "+12%",
                trendType: "positive",
                progress: 82,
                insight: "Focus on high-value deals to close gap",
                icon: "💰"
            },
            {
                id: 2,
                title: "Visit Compliance",
                value: "88%",
                target: "95%",
                achievement: "88%",
                trend: "+5%",
                trendType: "positive",
                progress: 88,
                insight: "Schedule 2 extra visits daily to reach target",
                icon: "✅"
            },
            {
                id: 3,
                title: "Active Dealers",
                value: "42",
                target: "50",
                achievement: "84%",
                trend: "+8%",
                trendType: "positive",
                progress: 84,
                insight: "Engage with 3 inactive dealers this week",
                icon: "🤝"
            },
            {
                id: 4,
                title: "Average Order Value",
                value: "₹2.1L",
                target: "₹2.5L",
                achievement: "84%",
                trend: "-3%",
                trendType: "negative",
                progress: 84,
                insight: "Promote premium products to boost AOV",
                icon: "📈"
            }
        ],

        insights: [
            {
                id: 1,
                title: "High Potential Dealer Identified",
                priority: "high",
                details: {
                    dealer: "Sharma Paper Mart",
                    jkStock: "45 reams",
                    competitorStock: "120 reams"
                },
                recommendation: "Offer a bulk discount to increase shelf share",
                impact: "Potential additional revenue: ₹2.5L",
                icon: "🎯",
                impactIcon: "✅"
            },
            {
                id: 2,
                title: "Visit Frequency Below Target",
                priority: "high",
                details: {
                    plannedVisits: "8",
                    completedVisits: "6"
                },
                recommendation: "2 high-priority visits are still pending",
                impact: "Risk of missing monthly target",
                icon: "🔔",
                impactIcon: "⚠️",
                isWarning: true
            },
            {
                id: 3,
                title: "Product Trend Analysis",
                priority: "medium",
                details: {
                    product: "JK Copier 75 GSM",
                    demandIncrease: "18% this month"
                },
                recommendation: "Promote this product aggressively in upcoming visits",
                impact: "High upselling potential available",
                icon: "📈",
                impactIcon: "💎"
            },
            {
                id: 4,
                title: "Expense ROI Excellent",
                priority: "low",
                details: {
                    expenseRatio: "4.2%",
                    comparison: "20% better than team average"
                },
                recommendation: "Excellent expense optimization",
                impact: "Eligible for performance recognition",
                icon: "🏆",
                impactIcon: "⭐"
            }
        ],

        weeklyPerformance: [
            {
                day: "Mon",
                visits: 8,
                orders: 6,
                revenue: "₹450K",
                conversion: "75%",
                trend: "positive"
            },
            {
                day: "Tue",
                visits: 7,
                orders: 5,
                revenue: "₹385K",
                conversion: "71%",
                trend: "positive"
            },
            {
                day: "Wed",
                visits: 9,
                orders: 7,
                revenue: "₹520K",
                conversion: "78%",
                trend: "positive"
            },
            {
                day: "Thu",
                visits: 6,
                orders: 4,
                revenue: "₹320K",
                conversion: "67%",
                trend: "neutral"
            },
            {
                day: "Fri",
                visits: 8,
                orders: 6,
                revenue: "₹480K",
                conversion: "75%",
                trend: "positive"
            }
        ],

        topProducts: [
            {
                rank: 1,
                name: "JK Copier 75 GSM",
                growth: "18%",
                quantity: "8,500 reams",
                revenue: "₹42.5L"
            },
            {
                rank: 2,
                name: "JK Bond 80 GSM",
                growth: "12%",
                quantity: "5,600 reams",
                revenue: "₹31.0L"
            },
            {
                rank: 3,
                name: "JK Excel 70 GSM",
                growth: "8%",
                quantity: "6,200 reams",
                revenue: "₹28.0L"
            },
            {
                rank: 4,
                name: "JK Easy Copier",
                growth: "22%",
                quantity: "2,000 reams",
                revenue: "₹19.5L"
            }
        ],

        dealerPerformance: [
            {
                id: 1,
                name: "Sharma Paper Mart",
                revenue: "₹2,85,000",
                visits: 4,
                orders: 3,
                trend: "growing",
                trendText: "Growing ↗"
            },
            {
                id: 2,
                name: "Modern Office Supplies",
                revenue: "₹2,45,000",
                visits: 3,
                orders: 2,
                trend: "growing",
                trendText: "Growing ↗"
            },
            {
                id: 3,
                name: "Krishna Stationers",
                revenue: "₹1,98,000",
                visits: 4,
                orders: 4,
                trend: "declining",
                trendText: "Declining ↘",
                isUrgent: true
            },
            {
                id: 4,
                name: "Gupta Enterprises",
                revenue: "₹1,75,000",
                visits: 3,
                orders: 2,
                trend: "growing",
                trendText: "Growing ↗"
            }
        ],

        actionItems: [
            {
                id: 1,
                title: "Focus on Sharma Paper Mart",
                detail: "Low JK stock detected",
                suggestion: "✅ Suggested order: 500 reams JK Copier 75 GSM (₹2.45L potential)",
                icon: "🎯",
                buttonText: "Set Priority",
                actionType: "primary",
                dealerName: "Sharma Paper Mart"
            },
            {
                id: 2,
                title: "Visit Krishna Stationers urgently",
                detail: "Revenue declined by 8%",
                suggestion: "📅 Schedule a meeting to identify concerns",
                icon: "🚨",
                buttonText: "Schedule Meeting",
                actionType: "urgent",
                isUrgent: true,
                dealerName: "Krishna Stationers"
            },
            {
                id: 3,
                title: "Promote JK Easy Copier",
                detail: "22% growth detected",
                suggestion: "🎯 Highlight in next 3 dealer visits",
                icon: "📈",
                buttonText: "Add to Promotion List",
                actionType: "primary"
            },
            {
                id: 4,
                title: "Complete pending visits",
                detail: "Visit compliance at risk",
                suggestion: "🔔 Visit 2 more dealers today to meet compliance target",
                icon: "📋",
                buttonText: "View Pending Visits",
                actionType: "default"
            }
        ],
        competitorAnalysis: []
    };

    // Dashboard metrics
    mainMetrics = [
        { id: 'todayVisits', title: "Today's Visits", value: "0", icon: "📍", trend: "No visits today", trendClass: "trend-neutral", subtext: "Schedule now", priority: "low" },
        { id: 'monthVisits', title: "This Month", value: "24", icon: "📅", trend: "+4 from last month", trendClass: "trend-positive", subtext: "On track", priority: "medium" },
        { id: 'totalAccounts', title: "Total Accounts", value: "156", icon: "🏢", trend: "+12 new", trendClass: "trend-positive", subtext: "Active", priority: "high" },
        { id: 'activeDealers', title: "Active Dealers", value: "42", icon: "🤝", trend: "All active", trendClass: "trend-positive", subtext: "Engaged", priority: "medium" },
        { id: 5, title: "Month Revenue", value: "₹7.8L", icon: "💹", trend: "+15% growth", trendClass: "trend-positive", subtext: "vs target ₹10L", priority: "high" },
        { id: 6, title: "Target Achievement", value: "78%", icon: "🎯", trend: "Ahead by 3%", trendClass: "trend-positive", subtext: "Good progress", priority: "high" },
        { id: 'pendingExpenses', title: "Pending Expenses", value: "3", icon: "📋", trend: "₹4,500 total", trendClass: "trend-warning", subtext: "Submit now", priority: "medium" },
        { id: 'awaitingApproval', title: "Awaiting Approval", value: "2", icon: "⏳", trend: "2 requests", trendClass: "trend-neutral", subtext: "Check status", priority: "low" }
    ];

    // priorityAccountsJP = [
    //     { id: 1, name: 'Global Enterprises', location: 'Downtown', priority: 'high', status: 'Visit Due' },
    //     { id: 2, name: 'Tech Valley Inc', location: 'Tech Park', priority: 'high', status: 'Follow-up' },
    //     { id: 3, name: 'City Traders Ltd', location: 'Business District', priority: 'medium', status: 'Regular Visit' },
    //     { id: 4, name: 'Metro Retail', location: 'Shopping Mall', priority: 'medium', status: 'Order Pending' },
    //     { id: 5, name: 'Local Suppliers Co', location: 'Industrial Area', priority: 'low', status: 'Check-in' }
    // ];



    weekDays = [];

    weekSchedule = [];
    monthDays = [];
    monthStats = {
        days: 30,
        totalVisits: 120,
        accounts: 45
    };

    // Expense Management Properties
    expenseData = {
        summary: {
            total: 0,
            approved: 0,
            pending: 0,
            submissions: 0
        },
        budget: {
            status: 'Within Budget',
            used: 0,
            total: 10000,
            remaining: 10000,
            percentage: 0
        },
        expensesByType: [
            { type: 'Travel', amount: 0, color: '#4CAF50' },
            { type: 'Food', amount: 0, color: '#2196F3' },
            { type: 'Stay', amount: 0, color: '#FF9800' },
            { type: 'Misc', amount: 0, color: '#9C27B0' }
        ],
        recentExpenses: [
            {
                id: 1,
                date: '2024-12-08',
                formattedDate: 'Dec 8, 2024',
                type: 'Travel',
                description: 'Taxi to client meeting',
                amount: 450,
                status: 'Approved',
                statusClass: 'expense-status-approved',
                submittedBy: 'John FieldRep',
                notes: 'Client visit reimbursement'
            },
            {
                id: 2,
                date: '2024-12-07',
                formattedDate: 'Dec 7, 2024',
                type: 'Food',
                description: 'Team lunch',
                amount: 1200,
                status: 'Pending',
                statusClass: 'expense-status-pending',
                submittedBy: 'John FieldRep',
                notes: 'Monthly team gathering'
            },
            {
                id: 3,
                date: '2024-12-05',
                formattedDate: 'Dec 5, 2024',
                type: 'Stay',
                description: 'Hotel accommodation',
                amount: 3500,
                status: 'Approved',
                statusClass: 'expense-status-approved',
                submittedBy: 'John FieldRep',
                notes: 'Outstation client visit'
            },
            {
                id: 4,
                date: '2024-12-01',
                formattedDate: 'Dec 1, 2024',
                type: 'Misc',
                description: 'Office supplies',
                amount: 650,
                status: 'Rejected',
                statusClass: 'expense-status-rejected',
                submittedBy: 'John FieldRep',
                notes: 'Not within budget'
            },
            {
                id: 5,
                date: '2024-11-28',
                formattedDate: 'Nov 28, 2024',
                type: 'Travel',
                description: 'Flight tickets',
                amount: 8500,
                status: 'Approved',
                statusClass: 'expense-status-approved',
                submittedBy: 'John FieldRep',
                notes: 'Business trip to Delhi'
            }
        ]
    };

    timerInterval;

    @wire(getRecord, {
        recordId: USER_ID,
        fields: [NAME_FIELD, PROFILE_NAME_FIELD]
    })
    userRecord({ data, error }) {
        if (data) {
            this.userName = data.fields.Name.value;
            this.userRole = data.fields.Profile.displayValue;
        } else if (error) {
            console.error(error);
        }
    }


    // ========== GETTERS ==========

    get countryOptions() {
        return [
            { label: 'India', value: 'India' },
            { label: 'United States', value: 'USA' },
            { label: 'United Kingdom', value: 'UK' },
            { label: 'United Arab Emirates', value: 'UAE' },
            { label: 'Other', value: 'Other' }
        ];
    }

    get isDashboardActive() {
        return this.activeTab === 'dashboard';
    }

    get isAttendanceActive() {
        return this.activeTab === 'attendance';
    }

    get isJourneyPlanActive() {
        return this.activeTab === 'journey-plan';
    }

    get isExpensesActive() {
        return this.activeTab === 'expenses';
    }

    get isNewAccountActive() {
        return this.activeTab === 'new-account';
    }

    get isVisitExecutionActive() {
        return this.activeTab === 'visit-execution';
    }


    get isAiAnalyticsActive() {
        return this.activeTab === 'ai-analytics';
    }

    get isAccount360Active() {
        return this.activeTab === 'account-360';
    }

    get isPrimaryOrdersActive() {
        return this.activeTab === 'primary-orders';
    }




    get isOtherTabActive() {
        return !this.isDashboardActive && !this.isAttendanceActive && !this.isJourneyPlanActive &&
            !this.isExpensesActive && !this.isNewAccountActive && !this.isAiAnalyticsActive &&
            !this.isAccount360Active && !this.isPrimaryOrdersActive;
    }


    get activeTabLabel() {
        const tab = this.tabs.find(t => t.id === this.activeTab);
        return tab ? tab.label : 'Dashboard';
    }

    openScheduleVisitFromJP() {
        this.showScheduleVisitModal = true;
    }

    openBulkUploadJP() {
        // Navigate to Salesforce Import Wizard for Visit__c object
        const importUrl = 'https://orgfarm-fcc6593428-dev-ed.develop.my.salesforce-setup.com/one/one.app?SetupDomainProbePassed=true&SetupDomainReload=1#eyJjb21wb25lbnREZWYiOiJvbmU6YWxvaGFQYWdlIiwiYXR0cmlidXRlcyI6eyJhZGRyZXNzIjoiL2RhdGFJbXBvcnRlci9kYXRhSW1wb3J0ZXIuYXBwP29iamVjdFNlbGVjdGlvbj1WaXNpdF9fYyJ9LCJzdGF0ZSI6e319';
        window.open(importUrl, '_blank');
    }

    handleJPVisitAction(event) {
        const visitId = event.currentTarget.dataset.id;
        // Switch to Visit Execution tab and open check-in
        this.activeTab = 'visit-execution';
        sessionStorage.setItem('activeTab', 'visit-execution');
        // Trigger check-in flow there
        this.template.querySelector('[data-id="' + visitId + '"]')?.click();
    }
    get checkInOutButtonText() {
        return this.isCheckedIn ? 'Check Out' : 'Check In';
    }

    get checkinButtonClass() {
        return this.isCheckedIn ? 'checkin-btn checked-in' : 'checkin-btn';
    }

    get statusIndicatorClass() {
        if (this.isCheckedIn) {
            return 'status-indicator checked-in';
        } else if (this.attendanceStatus === 'Checked Out') {
            return 'status-indicator checked-out';
        } else {
            return 'status-indicator';
        }
    }

    get weeklyCompliance() {
        if (!this.weeklyData || this.weeklyData.length === 0) return 0;
        const total = this.weeklyData.reduce((sum, day) => sum + day.value, 0);
        return Math.round(total / this.weeklyData.length);
    }

    get onTimeCount() {
        if (!this.weeklyData) return 0;
        return this.weeklyData.filter(day => day.value >= 90).length;
    }

    get lateCount() {
        if (!this.weeklyData) return 0;
        return this.weeklyData.filter(day => day.value < 90).length;
    }

    // Journey Plan Getters
    get selectedDateDisplay() {
        return this.selectedDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    get isDayView() {
        return this.selectedView === 'day';
    }

    get isWeekView() {
        return this.selectedView === 'week';
    }

    get isMonthView() {
        return this.selectedView === 'month';
    }


    get travelAmount() {
        const travelItem = this.expenseData.expensesByType.find(item => item.type === 'Travel');
        return travelItem ? travelItem.amount : 0;
    }

    get foodAmount() {
        const foodItem = this.expenseData.expensesByType.find(item => item.type === 'Food');
        return foodItem ? foodItem.amount : 0;
    }

    get stayAmount() {
        const stayItem = this.expenseData.expensesByType.find(item => item.type === 'Stay');
        return stayItem ? stayItem.amount : 0;
    }

    get miscAmount() {
        const miscItem = this.expenseData.expensesByType.find(item => item.type === 'Misc');
        return miscItem ? miscItem.amount : 0;
    }

    get hasTravelExpenses() {
        return this.travelAmount > 0;
    }

    get hasFoodExpenses() {
        return this.foodAmount > 0;
    }

    get hasStayExpenses() {
        return this.stayAmount > 0;
    }

    get hasMiscExpenses() {
        return this.miscAmount > 0;
    }

    get travelBarStyle() {
        return this.getBarStyle('Travel');
    }

    get foodBarStyle() {
        return this.getBarStyle('Food');
    }

    get stayBarStyle() {
        return this.getBarStyle('Stay');
    }

    get miscBarStyle() {
        return this.getBarStyle('Misc');
    }

    // get recentExpensesList() {
    //     return this.expenseData.recentExpenses.map(expense => ({
    //         ...expense,
    //         typeBadgeClass: this.getExpenseBadgeClass(expense.type)
    //     }));
    // }

    // New Account Onboarding Getters
    get showForm() {
        return !this.showSuccessState;
    }

    // AI Analytics Getters
    get lastRefreshText() {
        if (!this.lastRefreshTime) {
            return "Never refreshed";
        }

        const now = new Date();
        const diffMs = now - this.lastRefreshTime;
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) {
            return "Just now";
        } else if (diffMins < 60) {
            return `${diffMins} minutes ago`;
        } else {
            return this.lastRefreshTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
    }

    get aiStatusClass() {
        return this.aiStatus === 'active' ? 'ai-indicator active' : 'ai-indicator';
    }

    get totalPotentialRevenue() {
        let total = 0;
        this.aiData.insights.forEach(insight => {
            if (insight.impact && insight.impact.includes('₹')) {
                const match = insight.impact.match(/₹(\d+\.?\d*)L/);
                if (match) {
                    const amount = parseFloat(match[1]) * 100000;
                    total += amount;
                }
            }
        });

        return total > 0 ? `₹${(total / 100000).toFixed(1)}L` : "₹0";
    }

    get highPriorityActions() {
        return this.aiData.actionItems.filter(item => item.isUrgent).length;
    }

    get completionRate() {
        const completed = this.aiData.weeklyPerformance.filter(day => {
            const conversion = parseInt(day.conversion);
            return conversion >= 70;
        }).length;
        return Math.round((completed / this.aiData.weeklyPerformance.length) * 100);
    }

    get budgetProgressWidth() {
        const percent = Math.min(this.budget.usedPercent, 100);
        return `width:${percent}%`;
    }

    get budgetPercentageText() {
        return `${this.budget.usedPercent}% Used`;
    }

    get budgetStatusClass() {
        return this.budget.status === 'Over Budget'
            ? 'status-badge over-budget'
            : 'status-badge within-budget';
    }

    getPriorityClass(priorityValue) {
        const p = (priorityValue || '').toLowerCase();
        if (p === 'high') return 'priority-bar high';
        if (p === 'medium') return 'priority-bar medium';
        return 'priority-bar low';
    }




    // ========== LIFECYCLE METHODS ==========
    // Update your connectedCallback to initialize weekly/monthly views
    connectedCallback() {
        const savedTab = sessionStorage.getItem('activeTab');
        if (savedTab) {
            this.activeTab = savedTab;
        }
        this.updateDateTime();

        // Update date/time every second
        this.timerInterval = setInterval(() => {
            this.updateDateTime();
        }, 1000);

        // Initialize with default map marker
        this.initializeMap();

        // Update GPS coordinates display
        this.gpsCoordinates = this.displayCoordinates;
        this.loadRecentAttendance();
        this.loadWeeklyCompliance();

        // Initialize weekly and monthly views
        //this.generateWeekView();
        this.generateMonthView();

        // Initialize Expense data
        this.initializeExpenseData();

        // Initialize AI Analytics data
        this.initializeAIData();

        this.loadCarouselDates();
        this.loadTodayProgress();

        this.selectedDate = new Date();
        this.loadDayVisits();

        this.loadExpenseSummary();
        this.loadBudgetSummary();
        this.loadRecentExpenses();
        this.loadDashboardMetrics();
        this.loadLast14DaysVisits();
        this.loadDashboardAttendanceCompliance();
        this.loadPriorityAccounts();
        this.loadPriorityAccountsJP();
    }

    loadDashboardMetrics() {
        getDashboardData()
            .then(data => {
                console.log('dashboard data >>>' + data);
                if (!data) return;

                // Today
                if (data.todayVisits !== undefined) {
                    this.todayVisits = data.todayVisits;
                }

                // Month
                if (data.monthlyVisits !== undefined) {
                    this.monthVisits = data.monthlyVisits;
                }

                // Pending Expenses
                if (data.pendingExpenses !== undefined) {
                    this.pendingExpenses = data.pendingExpenses;
                }

                // Awaiting Approval ✅ (ADD THIS)
                if (data.awaitingApproval !== undefined) {
                    this.awaitingApproval = data.awaitingApproval;
                }

                if (data.activeDealers !== undefined) {
                    this.activeDealers = data.activeDealers;
                }

                if (data.totalAccounts !== undefined) {
                    this.totalAccounts = data.totalAccounts;
                }



                this.updateDashboardMetrics();
            })
            .catch(error => {
                console.error('Error loading dashboard metrics', error);
            });
    }

    loadPriorityAccounts() {
        getPriorityAccounts({ limitSize: 5 })
            .then(result => {
                this.priorityAccounts = (result || []).map(acc => ({
                    id: acc.id,
                    name: acc.name,
                    priority: (acc.priority || 'Low'),
                    // ✅ used for left color bar
                    priorityClass: this.getPriorityClass(acc.priority)
                }));
            })
            .catch(err => {
                console.error("❌ Priority accounts error", err);
                this.priorityAccounts = [];
            });
    }

    loadPriorityAccountsJP() {
        getPriorityAccounts({ limitSize: 5 })
            .then(result => {
                this.priorityAccountsJP = (result || []).map(acc => ({
                    id: acc.id,
                    name: acc.name,
                    location: acc.location || '—',   // optional
                    status: 'Visit Due',             // optional (you can change)
                    priority: acc.priority || 'Low',
                    priorityClass: this.getPriorityClass(acc.priority) // ✅ color
                }));
            })
            .catch(err => {
                console.error("❌ Journey Priority accounts error", err);
                this.priorityAccountsJP = [];
            });
    }



    loadDashboardAttendanceCompliance() {
        getDashboardAttendanceCompliance()
            .then(result => {
                this.attendanceComplianceSummary = {
                    compliancePercent: result.compliancePercent || 0,
                    presentDays: result.presentDays || 0,
                    totalDays: result.totalDays || 0,
                    onTimeDays: result.onTimeDays || 0
                };
            })
            .catch(error => {
                console.error('❌ Compliance load error', error);
                this.attendanceComplianceSummary = {
                    compliancePercent: 0,
                    presentDays: 0,
                    totalDays: 0,
                    onTimeDays: 0
                };
            });
    }


    loadLast14DaysVisits() {
        return getLast14DaysVisits()
            .then(result => {
                const mapped = (result || []).map(v => {
                    const d = v.visitDate ? new Date(v.visitDate) : null;
                    return {
                        id: v.id,
                        visitDate: v.visitDate || null,
                        time: v.time || this.formatTime(v.startTime),
                        account: v.account,
                        status: v.status,
                        statusClass: this.getStatusClass(v.status),
                        dayLabel: d
                            ? d.toLocaleDateString('en-IN', { weekday: 'short' })
                            : '—',
                        dateDisplay: d
                            ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                            : '—'
                    };
                });

                this.recentVisits = mapped.slice(0, 3);
                this.allVisits = mapped;
            })
            .catch(error => {
                console.error('❌ Error loading last 14 days visits', error);
                this.recentVisits = [];
                this.allVisits = [];
            });
    }

    get vhfAllClass() { return this.visitHistoryFilter === 'all' ? 'vhf-btn vhf-active' : 'vhf-btn'; }
    get vhfMonthClass() { return this.visitHistoryFilter === 'month' ? 'vhf-btn vhf-active' : 'vhf-btn'; }
    get vhfWeekClass() { return this.visitHistoryFilter === 'week' ? 'vhf-btn vhf-active' : 'vhf-btn'; }

    get filteredVisits() {
        if (!this.allVisits || !this.allVisits.length) return [];

        const now = new Date();

        if (this.visitHistoryFilter === 'month') {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            return this.allVisits.filter(v => v.time && new Date(v.time) >= monthStart);
        }

        if (this.visitHistoryFilter === 'week') {
            const day = now.getDay();
            const diff = day === 0 ? -6 : 1 - day;          // Monday = week start
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() + diff);
            weekStart.setHours(0, 0, 0, 0);
            return this.allVisits.filter(v => v.time && new Date(v.time) >= weekStart);
        }

        return this.allVisits;  // 'all'
    }

    handleVisitHistoryFilter(event) {
        this.visitHistoryFilter = event.currentTarget.dataset.filter;
    }

    handleVisitHistoryItemClick(event) {
        const visitId = event.currentTarget.dataset.id;
        if (!visitId) return;

        // Close the modal
        this.showVisitHistoryModal = false;

        // Switch to Visit Execution and open the detail view
        this.activeTab = 'visit-execution';
        this.activeVisitId = visitId;
        this.activeVisitCheckInTime = null;
        this.activeVisitLat = null;
        this.activeVisitLng = null;
        this.activeVisitAddress = '';
    }

    updateDashboardMetrics() {
        this.mainMetrics = this.mainMetrics.map(metric => {

            // ===== TODAY VISITS =====
            if (metric.id === 'todayVisits') {
                const v = this.todayVisits;

                return {
                    ...metric,
                    value: v,
                    trend:
                        v === 0 ? 'No visits today'
                            : v === 1 ? '1 visit scheduled'
                                : `${v} visits scheduled`,
                    trendClass: v === 0 ? 'trend-neutral' : 'trend-positive',
                    subtext: v === 0 ? 'Schedule now' : 'View schedule'
                };
            }

            // ===== MONTH VISITS =====
            if (metric.id === 'monthVisits') {
                return {
                    ...metric,
                    value: this.monthVisits
                };
            }

            // ===== PENDING EXPENSES =====
            if (metric.id === 'pendingExpenses') {
                const p = this.pendingExpenses;

                return {
                    ...metric,
                    value: p,
                    trend:
                        p === 0 ? 'No pending expenses'
                            : `${p} expense${p === 1 ? '' : 's'} pending`,
                    trendClass: p > 0 ? 'trend-warning' : 'trend-positive',
                    subtext: p > 0 ? 'Submit now' : 'All clear'
                };
            }

            // ===== AWAITING APPROVAL =====
            if (metric.id === 'awaitingApproval') {
                const a = this.awaitingApproval;

                return {
                    ...metric,
                    value: a,
                    trend:
                        a === 0 ? 'No pending approvals'
                            : a === 1 ? '1 request pending'
                                : `${a} requests pending`,
                    trendClass: a > 0 ? 'trend-warning' : 'trend-positive',
                    subtext: a > 0 ? 'Check status' : 'All clear'
                };
            }

            if (metric.id === 'activeDealers') {
                const a = this.activeDealers;

                return {
                    ...metric,
                    value: a,
                    trend:
                        a === 0
                            ? 'No active dealers'
                            : `${a} dealer${a === 1 ? '' : 's'} active`,
                    trendClass: a === 0 ? 'trend-warning' : 'trend-positive',
                    subtext: a === 0 ? 'Engage dealers' : 'Engaged'
                };
            }

            if (metric.id === 'totalAccounts') {
                return {
                    ...metric,
                    value: this.totalAccounts,
                    trend: `${this.totalAccounts} total accounts`,
                    trendClass: 'trend-positive',
                    subtext: 'Active'
                };
            }



            return metric;
        });
    }




    loadCarouselDates() {
        const dates = [];
        const dateList = [];

        for (let i = 0; i < 12; i++) {
            const d = new Date(this.carouselStartDate);
            d.setDate(this.carouselStartDate.getDate() + i);

            dates.push(d);
            dateList.push(this.formatDateForApex(d));
        }
        console.log('dateList>>' + dateList);
        getVisitCountsByDates({ dates: dateList })
            .then(result => {
                console.log('Visit count map (raw):', result);
                console.log('Visit count map (JSON):', JSON.stringify(result));
                this.carouselDates = dates.map(d => {
                    const key = this.formatDateForApex(d);
                    console.log('key>>' + key);
                    const visitValue = result[key];
                    console.log('visitValue>>' + visitValue);

                    return {
                        id: key,
                        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
                        dateNum: d.getDate(),
                        month: d.toLocaleDateString('en-US', { month: 'short' }),
                        visits: result[key] || 0
                    };
                });
            })
            .catch(err => console.error(err));
    }


    loadTodayProgress() {
        getDayPlan({ visitDate: this.formatDateForApex(this.selectedDate) })
            .then(result => {
                if (!result) {
                    this.resetDayStats();
                    return;
                }

                this.dayStats = {
                    plannedVisits: result.planned,
                    completedToday: result.completed,
                    estimatedDuration: this.calculateEstimatedDuration(result.planned)
                };

                this.todayProgress = {
                    planned: result.planned,
                    completed: result.completed,
                    pending: result.pending,
                    successRate: result.successRate
                };
            })
            .catch(error => {
                console.error('Error loading day plan', error);
                this.resetDayStats();
            });
    }

    resetDayStats() {
        this.dayStats = {
            plannedVisits: 0,
            estimatedDuration: '—',
            completedToday: 0
        };
    }


    // formatDateForApex(date) {
    //     return date.toISOString().split('T')[0];
    // }

    formatDateForApex(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    get todayProgressWidth() {
        return `width:${this.todayProgress.successRate}%`;
    }

    loadTodayAttendance() {
        getTodayAttendance()
            .then(att => {
                if (att) {
                    this.attendanceRecordId = att.Id;
                    this.attendanceStatus = att.Status__c;

                    if (att.Status__c === 'Checked In') {
                        this.isCheckedIn = true;
                        this.checkInTime = new Date(att.Check_In_Time__c);
                        this.currentAddress = att.Check_In_Address__c;
                        this.currentLatitude = att.Check_In_Latitude__c;
                        this.currentLongitude = att.Check_In_Longitude__c;
                    } else {
                        this.isCheckedIn = false;
                    }
                }
            })
            .catch(error => {
                console.error('Error loading today attendance', error);
            });
    }

    loadAllAttendanceLast14Days() {
        this.isAttendanceLoading = true;

        getAttendanceLast14Days()
            .then(result => {
                const mapped = result.map(att => {
                    const attDate = att.Attendance_Date__c
                        ? new Date(att.Attendance_Date__c)
                        : null;

                    return {
                        id: att.Id,

                        day: attDate
                            ? attDate.toLocaleDateString('en-US', { weekday: 'short' })
                            : '-',

                        date: attDate
                            ? attDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                            : '-',

                        fullDate: attDate
                            ? attDate.toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            })
                            : '-',

                        checkIn: att.Check_In_Time__c
                            ? new Date(att.Check_In_Time__c).toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit'
                            })
                            : '-',

                        checkOut: att.Check_Out_Time__c
                            ? new Date(att.Check_Out_Time__c).toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit'
                            })
                            : '-',

                        checkInLocation: att.Check_In_Address__c || '—',
                        checkOutLocation: att.Check_Out_Address__c || '—',

                        checkInCoords:
                            att.Check_In_Latitude__c && att.Check_In_Longitude__c
                                ? `${att.Check_In_Latitude__c}, ${att.Check_In_Longitude__c}`
                                : '—',

                        checkOutCoords:
                            att.Check_Out_Latitude__c && att.Check_Out_Longitude__c
                                ? `${att.Check_Out_Latitude__c}, ${att.Check_Out_Longitude__c}`
                                : '—',

                        checkInLat: att.Check_In_Latitude__c,
                        checkInLng: att.Check_In_Longitude__c,
                        checkOutLat: att.Check_Out_Latitude__c,
                        checkOutLng: att.Check_Out_Longitude__c,

                        duration: att.Work_Duration__c,
                        status: att.Status__c,

                        statusClass:
                            att.Status__c === 'Checked In'
                                ? 'status checked-in'
                                : 'status checked-out'
                    };
                });

                this.allAttendance = mapped;
                console.log("✅ allAttendance (14 days) =>", JSON.stringify(this.allAttendance));

            })
            .catch(error => {
                console.error("❌ Error loading last 14 days attendance", error);
            })
            .finally(() => {
                this.isAttendanceLoading = false;
            });
    }


    loadRecentAttendance() {
        getRecentAttendance()
            .then(result => {
                console.log('Recent Attendance Raw =>', JSON.stringify(result));

                const mapped = result.map(att => {
                    const attDate = att.Attendance_Date__c
                        ? new Date(att.Attendance_Date__c + 'T00:00:00')
                        : null;

                    return {
                        id: att.Id,

                        day: attDate
                            ? attDate.toLocaleDateString('en-IN', { weekday: 'short' })
                            : '-',

                        date: attDate
                            ? attDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
                            : '-',

                        fullDate: attDate
                            ? attDate.toLocaleDateString('en-IN', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            })
                            : '-',

                        checkIn: this.formatSalesforceDateTime(att.Check_In_Time__c),
                        checkOut: this.formatSalesforceDateTime(att.Check_Out_Time__c),

                        checkInLocation: att.Check_In_Address__c || '—',
                        checkOutLocation: att.Check_Out_Address__c || '—',

                        checkInCoords:
                            att.Check_In_Latitude__c && att.Check_In_Longitude__c
                                ? `${att.Check_In_Latitude__c}, ${att.Check_In_Longitude__c}`
                                : '—',

                        checkOutCoords:
                            att.Check_Out_Latitude__c && att.Check_Out_Longitude__c
                                ? `${att.Check_Out_Latitude__c}, ${att.Check_Out_Longitude__c}`
                                : '—',

                        checkInLat: att.Check_In_Latitude__c,
                        checkInLng: att.Check_In_Longitude__c,
                        checkOutLat: att.Check_Out_Latitude__c,
                        checkOutLng: att.Check_Out_Longitude__c,

                        duration: att.Work_Duration__c,
                        status: att.Status__c,

                        statusClass:
                            att.Status__c === 'Checked In'
                                ? 'status checked-in'
                                : 'status checked-out'
                    };
                });

                // ✅ recent 3 records
                this.recentAttendance = mapped.slice(0, 3);

                console.log('✅ recentAttendance Mapped =>', JSON.stringify(this.recentAttendance));
            })
            .catch(error => {
                console.error('❌ Error loading recent attendance', error);
                this.recentAttendance = [];
            });
    }


    loadWeeklyCompliance() {
        getLast7DayCompliance()
            .then(result => {
                this.weeklyData = result.map((day, index) => ({
                    id: index + 1,
                    label: day.label,
                    value: day.value,
                    onTime: day.onTime
                }));
            })
            .catch(error => {
                console.error('Error loading weekly compliance', error);
            });
    }

    loadExpenseSummary() {
        getExpenseSummary()
            .then(result => {
                console.log('Expense Summary from Apex =>', result);
                this.expenseSummary = {
                    totalAmount: result.totalAmount || 0,
                    approvedCount: result.approvedCount || 0,
                    pendingCount: result.pendingCount || 0,
                    totalSubmissions: result.totalSubmissions || 0
                };
            })
            .catch(error => {
                console.error('Error loading expense summary', error);
            });
    }

    loadBudgetSummary() {
        getBudgetSummary()
            .then(result => {
                this.budget = {
                    total: result.totalBudget,
                    used: result.usedAmount,
                    remaining: result.remainingAmount,
                    usedPercent: result.usedPercent,
                    status: result.status
                };
            })
            .catch(error => {
                console.error('Error loading budget summary', error);
            });
    }


    loadRecentExpenses() {
        this.isExpenseLoading = true;

        getRecentExpenses({ limitSize: 5 })
            .then(result => {
                this.recentExpenses = result.map(exp => ({
                    id: exp.Id,
                    date: exp.Expense_Date__c,
                    formattedDate: exp.Expense_Date__c
                        ? new Date(exp.Expense_Date__c).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                        })
                        : '—',
                    type: exp.Expense_Type__c,
                    description: exp.Description__c,
                    amount: exp.Amount__c,
                    status: exp.Status__c,
                    statusClass: this.getExpenseStatusClass(exp.Status__c)
                }));
            })
            .catch(error => {
                console.error('Error loading recent expenses', error);
            })
            .finally(() => {
                this.isExpenseLoading = false;
            });
    }


    getExpenseStatusClass(status) {
        switch (status) {
            case 'Approved':
                return 'expense-status-approved';
            case 'Submitted':
                return 'expense-status-pending';
            case 'Rejected':
                return 'expense-status-rejected';
            default:
                return 'expense-status-draft';
        }
    }

    loadAllExpenses() {
        getAllExpenses()
            .then(result => {
                this.allExpenses = result.map(exp => ({
                    id: exp.Id,
                    formattedDate: exp.Expense_Date__c
                        ? new Date(exp.Expense_Date__c).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                        })
                        : '—',
                    type: exp.Expense_Type__c,
                    description: exp.Description__c,
                    amount: exp.Amount__c,
                    status: exp.Status__c,
                    statusClass: this.getExpenseStatusClass(exp.Status__c),
                    typeBadgeClass: this.getExpenseBadgeClass(exp.Expense_Type__c),
                    submittedBy: exp.CreatedBy?.Name || '—'
                }));
            })
            .catch(error => {
                console.error('Error loading all expenses', error);
            });
    }


    get recentExpensesList() {
        return this.recentExpenses.map(exp => ({
            ...exp,
            typeBadgeClass: this.getExpenseBadgeClass(exp.type),
            submittedBy: 'You' // temporary (we’ll make dynamic later)
        }));
    }


    disconnectedCallback() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
    }

    renderedCallback() {
        // Update active tab styling after render
        this.updateActiveTabStyles();

        // Set active view button for journey plan
        if (this.isJourneyPlanActive) {
            const viewButtons = this.template.querySelectorAll('.view-btn');
            viewButtons.forEach(btn => {
                if (btn.dataset.view === this.selectedView) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
    }

    // ========== COMMON METHODS ==========
    updateDateTime() {
        const now = new Date();

        // Format date
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        this.currentDate = now.toLocaleDateString('en-US', dateOptions);

        // Format time
        const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
        this.currentTime = now.toLocaleTimeString('en-US', timeOptions);

        // Update duration if checked in
        if (this.isCheckedIn && this.checkInTime) {
            this.updateCurrentDuration();
        }
    }

    updateCurrentDuration() {
        if (!this.checkInTime) return;

        const now = new Date();
        const diffMs = now - this.checkInTime;
        const diffSecs = Math.floor(diffMs / 1000);

        const hours = Math.floor(diffSecs / 3600);
        const minutes = Math.floor((diffSecs % 3600) / 60);
        const seconds = diffSecs % 60;

        this.currentDuration = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    initializeMap() {
        // Initialize with a default location (Mumbai)
        this.mapMarkers = [{
            location: {
                Latitude: 19.0760,
                Longitude: 72.8777
            },
            title: 'Default Location',
            description: 'Mumbai, Maharashtra',
            icon: 'standard:location'
        }];

        // For attendance modal
        this.checkInMapMarkers = [{
            location: {
                Latitude: 19.0760,
                Longitude: 72.8777
            },
            title: 'Check-In Location',
            description: 'Office HQ, Mumbai',
            icon: 'standard:checkin'
        }];

        this.checkOutMapMarkers = [{
            location: {
                Latitude: 19.0759,
                Longitude: 72.8778
            },
            title: 'Check-Out Location',
            description: 'Client Site, Andheri',
            icon: 'standard:logout'
        }];
    }

    handleTabClick(event) {
        this.activeTab = event.currentTarget.dataset.id;
        sessionStorage.setItem('activeTab', this.activeTab);
        this.updateActiveTabStyles();
    }

    updateActiveTabStyles() {
        // Remove active class from all tabs
        const tabs = this.template.querySelectorAll('.nav-tab');
        tabs.forEach(tab => {
            tab.classList.remove('active');
        });

        // Add active class to current tab
        const activeTab = this.template.querySelector(`.nav-tab[data-id="${this.activeTab}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
        }
    }

    // ========== ATTENDANCE METHODS ==========
    async handleCheckInOut() {
        try {
            this.isSubmitting = true;

            // ✅ WAIT for GPS
            await this.getCurrentLocation();

            if (!this.isCheckedIn) {
                // ===== CHECK IN =====
                const recordId = await handleCheckIn({
                    lat: this.currentLatitude,
                    lng: this.currentLongitude,
                    address: this.currentAddress
                });

                this.attendanceRecordId = recordId;
                this.isCheckedIn = true;
                this.attendanceStatus = 'Checked In';
                this.checkInTime = new Date();

                this.showToast('Checked in successfully', 'success');

            } else {
                // ===== CHECK OUT =====
                await handleCheckOut({
                    recordId: this.attendanceRecordId,
                    lat: this.currentLatitude,
                    lng: this.currentLongitude,
                    address: this.currentAddress
                });

                this.isCheckedIn = false;
                this.attendanceStatus = 'Checked Out';
                this.checkInTime = null;
                this.currentDuration = '00:00:00';

                this.showToast('Checked out successfully', 'success');
            }

            this.loadRecentAttendance();
            this.loadWeeklyCompliance();
            this.loadDashboardAttendanceCompliance();
            this.loadDashboardMetrics();


        } catch (error) {
            console.error(error);
            this.showToast('Unable to capture location', 'error');
        } finally {
            this.isSubmitting = false;
        }
    }



    addAttendanceRecord() {
        const now = new Date();
        const timeOptions = { hour: '2-digit', minute: '2-digit' };

        const newRecord = {
            id: this.recentAttendance.length + 1,
            day: 'Today',
            date: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            checkIn: '09:00 AM',
            checkOut: now.toLocaleTimeString('en-US', timeOptions),
            fullDate: now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            checkInCoords: this.gpsCoordinates,
            checkOutCoords: this.gpsCoordinates,
            checkInLocation: this.currentAddress,
            checkOutLocation: this.currentAddress,
            checkInLat: this.currentLatitude || 19.0760,
            checkInLng: this.currentLongitude || 72.8777,
            checkOutLat: this.currentLatitude || 19.0759,
            checkOutLng: this.currentLongitude || 72.8778,
            status: 'On Time',
            statusClass: 'attendance-status on-time'
        };

        // Add to beginning of array
        this.recentAttendance = [newRecord, ...this.recentAttendance.slice(0, 2)];
    }

    getCurrentLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject('Geolocation not supported');
                return;
            }

            navigator.geolocation.getCurrentPosition(
                position => {
                    this.currentLatitude = position.coords.latitude.toString();
                    this.currentLongitude = position.coords.longitude.toString();
                    this.locationAccuracy = Math.round(position.coords.accuracy);

                    this.gpsCoordinates = `${this.currentLatitude}, ${this.currentLongitude}`;

                    this.reverseGeocode(
                        this.currentLatitude,
                        this.currentLongitude
                    );

                    resolve(true);
                },
                error => {
                    this.handleLocationError(error);
                    reject(error);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        });
    }


    updateLocation(position) {
        this.currentLatitude = position.coords.latitude.toFixed(6);
        this.currentLongitude = position.coords.longitude.toFixed(6);
        this.locationAccuracy = Math.round(position.coords.accuracy);

        this.gpsCoordinates = `${this.currentLatitude}° N, ${this.currentLongitude}° E`;

        // Update map markers with current location
        this.mapMarkers = [{
            location: {
                Latitude: parseFloat(this.currentLatitude),
                Longitude: parseFloat(this.currentLongitude)
            },
            title: 'My Current Location',
            description: 'Captured via device GPS',
            icon: 'standard:location'
        }];

        // Update address using reverse geocoding (simulated)
        this.reverseGeocode(this.currentLatitude, this.currentLongitude);

        const now = new Date();
        const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
        this.locationUpdateTime = now.toLocaleTimeString('en-US', timeOptions);
    }

    reverseGeocode(lat, lng) {
        // Simulated reverse geocoding
        const locations = [
            { lat: 19.0760, lng: 72.8777, address: 'Mumbai, Maharashtra, India' },
            { lat: 28.7041, lng: 77.1025, address: 'New Delhi, Delhi, India' },
            { lat: 12.9716, lng: 77.5946, address: 'Bangalore, Karnataka, India' },
            { lat: 13.0827, lng: 80.2707, address: 'Chennai, Tamil Nadu, India' }
        ];

        // Find closest location
        let closest = locations[0];
        let minDistance = this.calculateDistance(lat, lng, closest.lat, closest.lng);

        for (let i = 1; i < locations.length; i++) {
            const distance = this.calculateDistance(lat, lng, locations[i].lat, locations[i].lng);
            if (distance < minDistance) {
                minDistance = distance;
                closest = locations[i];
            }
        }

        this.currentAddress = closest.address;
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    toRad(degrees) {
        return degrees * (Math.PI / 180);
    }

    handleLocationError(error) {
        switch (error.code) {
            case error.PERMISSION_DENIED:
                this.gpsCoordinates = 'Permission denied';
                this.currentAddress = 'User denied location access';
                break;
            case error.POSITION_UNAVAILABLE:
                this.gpsCoordinates = 'Position unavailable';
                this.currentAddress = 'Location information unavailable';
                break;
            case error.TIMEOUT:
                this.gpsCoordinates = 'Request timeout';
                this.currentAddress = 'Location request timed out';
                break;
            default:
                this.gpsCoordinates = 'Unknown error';
                this.currentAddress = 'Failed to get location';
                break;
        }
    }

    refreshMap() {
        this.getCurrentLocation();
    }

    openScheduleVisitModal(event) {
        this.selectedAccountId = event.currentTarget.dataset.id;

        const acc = this.priorityAccounts.find(a => a.id === this.selectedAccountId);

        this.selectedAccountName = acc ? acc.name : '—';

        this.visitForm = {
            visitDate: '',
            plannedStartTime: ''
        };

        this.showScheduleVisitModal = true;
    }


    closeScheduleVisitModal() {
        this.showScheduleVisitModal = false;
    }


    openAttendanceDetails(event) {
        const recordId = parseInt(event.currentTarget.dataset.id);
        const record = this.recentAttendance.find(r => r.id === recordId);
        if (record) {
            this.selectedAttendance = record;

            // Update map markers for modal
            this.checkInMapMarkers = [{
                location: {
                    Latitude: record.checkInLat,
                    Longitude: record.checkInLng
                },
                title: 'Check-In Location',
                description: record.checkInLocation,
                icon: 'standard:checkin'
            }];

            this.checkOutMapMarkers = [{
                location: {
                    Latitude: record.checkOutLat,
                    Longitude: record.checkOutLng
                },
                title: 'Check-Out Location',
                description: record.checkOutLocation,
                icon: 'standard:logout'
            }];

            this.showAttendanceModal = true;
        }
    }

    closeModal() {
        this.showAttendanceModal = false;
        this.selectedAttendance = {};
    }

    handleModalClick(event) {
        event.stopPropagation();
    }

    viewAllAttendance() {
        this.showAllAttendance = true;
        this.loadAllAttendanceLast14Days();
    }

    backToRecentAttendance() {
        this.showAllAttendance = false;
    }


    hideAllExpenses() {
        this.showAllExpenses = false;
    }

    downloadAttendance() {
        if (!this.selectedAttendance || !this.selectedAttendance.id) {
            this.showToast("No attendance selected to download", "error");
            return;
        }
        const dataStr = JSON.stringify(this.selectedAttendance, null, 2);
        const fileName = `Attendance-Report-${this.selectedAttendance.date}.json`;
        const blob = new Blob([dataStr], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.click();
    }

    viewAllExpenses() {
        this.showAllExpenses = true;
        this.loadAllExpenses();
        console.log("load expense from view all >>>" + this.loadAllExpenses());
    }

    backToRecentExpenses() {
        this.showAllExpenses = false;
    }


    handleEyeClick(event) {
        event.stopPropagation();

        const id = event.currentTarget.dataset.id;

        // first search in allAttendance then recentAttendance
        this.selectedAttendance =
            this.allAttendance.find(r => r.id == id) ||
            this.recentAttendance.find(r => r.id == id);

        if (this.selectedAttendance) {

            // Update map markers for modal
            this.checkInMapMarkers = [{
                location: {
                    Latitude: this.selectedAttendance.checkInLat,
                    Longitude: this.selectedAttendance.checkInLng
                },
                title: 'Check-In Location',
                description: this.selectedAttendance.checkInLocation,
                icon: 'standard:checkin'
            }];

            this.checkOutMapMarkers = [{
                location: {
                    Latitude: this.selectedAttendance.checkOutLat,
                    Longitude: this.selectedAttendance.checkOutLng
                },
                title: 'Check-Out Location',
                description: this.selectedAttendance.checkOutLocation,
                icon: 'standard:logout'
            }];

            this.showAttendanceModal = true;
        }
    }

    handleViewAllVisits() {
        this.visitHistoryFilter = 'all';
        this.loadLast14DaysVisits();
        this.showVisitHistoryModal = true;
    }

    closeVisitHistoryModal() {
        this.showVisitHistoryModal = false;
    }

    handleVisitFormChange(event) {
        const field = event.target.name;
        const value = event.target.value;

        this.visitForm = { ...this.visitForm, [field]: value };
    }


    handleNotify() {
        console.log('Notify me clicked');
    }

    // ========== EXPENSE MANAGEMENT METHODS ==========
    getBarStyle(type) {
        const typeData = this.expenseData.expensesByType.find(t => t.type === type);
        if (!typeData) return 'height: 0%; background-color: #ccc;';

        // Find the maximum amount for scaling
        const amounts = this.expenseData.expensesByType.map(t => t.amount);
        const maxAmount = Math.max(...amounts);
        const height = maxAmount > 0 ? (typeData.amount / maxAmount) * 100 : 0;
        return `height: ${height}%; background-color: ${typeData.color}`;
    }

    getExpenseBadgeClass(type) {
        const badgeClassMap = {
            'Travel': 'expense-type-badge travel-badge',
            'Food': 'expense-type-badge food-badge',
            'Stay': 'expense-type-badge stay-badge',
            'Misc': 'expense-type-badge misc-badge'
        };
        return badgeClassMap[type] || 'expense-type-badge';
    }

    handleSubmitExpense() {
        this.showExpenseSubmitModal = true;
    }

    closeExpenseSubmitModal() {
        this.showExpenseSubmitModal = false;
    }

    handleExpenseSubmitSuccess(event) {
        sessionStorage.setItem('activeTab', 'expenses');
        this.showExpenseSubmitModal = false;
        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Success',
                message: 'Expense submitted successfully!',
                variant: 'success'
            })
        );
        // Refresh the expense lists
        this.loadRecentExpenses();
        this.loadExpenseSummary();
        this.loadBudgetSummary();
    }

    handleExpenseSubmitError(event) {
        console.error('Expense submit error:', JSON.stringify(event.detail));
        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Error',
                message: event.detail?.detail || 'Failed to submit expense. Please try again.',
                variant: 'error'
            })
        );
    }

    handleViewExpenseDetails(event) {
        const expenseId = event.currentTarget.dataset.id;

        const expense = this.recentExpenses.find(exp => exp.id === expenseId);

        if (expense) {
            this.selectedExpense = expense;
            this.showExpenseModal = true;
        }
    }
    closeExpenseModal() {
        this.showExpenseModal = false;
        this.selectedExpense = {};
    }


    initializeExpenseData() {
        // Calculate summary from recent expenses
        let total = 0;
        let approved = 0;
        let pending = 0;
        let submissions = this.expenseData.recentExpenses.length;

        this.expenseData.recentExpenses.forEach(expense => {
            total += expense.amount;
            if (expense.status === 'Approved') approved++;
            if (expense.status === 'Pending') pending++;
        });

        this.expenseData.summary = { total, approved, pending, submissions };

        // Update budget usage
        this.expenseData.budget.used = total;
        this.expenseData.budget.remaining = this.expenseData.budget.total - total;
        this.expenseData.budget.percentage = (total / this.expenseData.budget.total) * 100;

        if (total > this.expenseData.budget.total) {
            this.expenseData.budget.status = 'Over Budget';
        } else if (total > this.expenseData.budget.total * 0.8) {
            this.expenseData.budget.status = 'Approaching Limit';
        } else {
            this.expenseData.budget.status = 'Within Budget';
        }

        // Update expenses by type
        this.expenseData.expensesByType.forEach(typeItem => {
            typeItem.amount = 0;
            this.expenseData.recentExpenses.forEach(expense => {
                if (expense.type === typeItem.type) {
                    typeItem.amount += expense.amount;
                }
            });
        });
    }

    handleAccountSelect(event) {
        console.log('✅ Account selected from 360 => ', event.detail.accountId);
    }


    // ========== JOURNEY PLAN METHODS ==========
    toggleCalendar() {
        this.showCalendar = !this.showCalendar;
        if (this.showCalendar) {
            this.generateCalendar();
        }
    }

    generateCalendar() {
        const date = this.selectedDate;
        const year = date.getFullYear();
        const month = date.getMonth();

        this.calendarMonth = date.toLocaleDateString('en-US', { month: 'long' });
        this.calendarYear = year;

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDay = firstDay.getDay();

        this.calendarDays = [];

        // Add empty days for previous month
        for (let i = 0; i < startingDay; i++) {
            const prevDate = new Date(year, month, -i);
            this.calendarDays.unshift({
                key: `prev-${i}`,
                day: prevDate.getDate(),
                date: prevDate.toISOString().split('T')[0],
                isToday: false,
                isSelected: false,
                hasVisits: Math.random() > 0.7,
                visits: Math.floor(Math.random() * 5) + 1
            });
        }

        // Add current month days
        for (let i = 1; i <= daysInMonth; i++) {
            const currentDate = new Date(year, month, i);
            const dateStr = currentDate.toISOString().split('T')[0];
            const today = new Date();
            const isToday = currentDate.getDate() === today.getDate() &&
                currentDate.getMonth() === today.getMonth() &&
                currentDate.getFullYear() === today.getFullYear();
            const isSelected = this.selectedDate.toISOString().split('T')[0] === dateStr;

            this.calendarDays.push({
                key: `current-${i}`,
                day: i,
                date: dateStr,
                isToday: isToday,
                isSelected: isSelected,
                hasVisits: Math.random() > 0.5,
                visits: Math.floor(Math.random() * 8) + 1
            });
        }

        // Add empty days for next month
        const totalCells = 42;
        const remainingCells = totalCells - this.calendarDays.length;
        for (let i = 1; i <= remainingCells; i++) {
            const nextDate = new Date(year, month + 1, i);
            this.calendarDays.push({
                key: `next-${i}`,
                day: i,
                date: nextDate.toISOString().split('T')[0],
                isToday: false,
                isSelected: false,
                hasVisits: Math.random() > 0.8,
                visits: Math.floor(Math.random() * 3) + 1
            });
        }
    }

    selectDate(event) {
        const dateStr = event.currentTarget.dataset.date;
        this.selectedDate = new Date(dateStr);
        this.showCalendar = false;
        //this.generateCarouselDates();
        this.updateViews();
        this.loadDayVisits();

    }

    prevMonth() {
        const newDate = new Date(this.selectedDate);
        newDate.setMonth(newDate.getMonth() - 1);
        this.selectedDate = newDate;
        this.generateCalendar();
    }

    nextMonth() {
        const newDate = new Date(this.selectedDate);
        newDate.setMonth(newDate.getMonth() + 1);
        this.selectedDate = newDate;
        this.generateCalendar();
    }

    changeView(event) {
        const view = event.currentTarget.dataset.view;
        this.selectedView = view;

        // Update active state in DOM
        const viewButtons = this.template.querySelectorAll('.view-btn');
        viewButtons.forEach(btn => {
            btn.classList.remove('active');
        });
        event.currentTarget.classList.add('active');

        this.updateViews();
    }


    // Helper method for estimated duration
    calculateEstimatedDuration(plannedVisits) {
        if (!plannedVisits || plannedVisits === 0) return '—';
        const hours = Math.round(plannedVisits * 1.5); // 1.5 hours per visit
        const minutes = (plannedVisits * 90) % 60;
        return `${hours}h ${minutes}m`;
    }



    prevDate() {
        const d = new Date(this.carouselStartDate);
        d.setDate(d.getDate() - 7);   // move window backward
        this.carouselStartDate = d;
        this.loadCarouselDates();
        this.loadDayVisits();

    }

    nextDate() {
        const d = new Date(this.carouselStartDate);
        d.setDate(d.getDate() + 7);   // move window forward
        this.carouselStartDate = d;
        this.loadCarouselDates();
        this.loadDayVisits();

    }


    // Update your existing updateViews method to use the new methods
    updateViews() {
        if (this.selectedView === 'week') {
            this.generateWeekView();   // ✅ NEW BACKEND-DRIVEN
        } else if (this.selectedView === 'month') {
            this.generateMonthView();
        }
    }


    async generateWeekView() {
        try {
            const startDate = this.getWeekStartDate(this.selectedDate);
            const startDateStr = this.formatDateForApex(startDate);

            const result = await getWeekVisits({ startDateStr });

            /* =========================
               WEEK OVERVIEW (TOP CARDS)
            ========================== */
            this.weekDays = [];
            let totalVisits = 0;

            for (let i = 0; i < 7; i++) {
                const d = new Date(startDate);
                d.setDate(d.getDate() + i);

                const key = this.formatDateForApex(d);
                const visitCount = result.dayVisitCount[key] || 0;

                totalVisits += visitCount;

                this.weekDays.push({
                    id: key,
                    dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
                    date: d.getDate(),
                    month: d.toLocaleDateString('en-US', { month: 'short' }),
                    visits: visitCount
                });
            }

            /* =========================
               WEEK DETAIL SCHEDULE
            ========================== */
            this.weekSchedule = result.visits.map(v => ({
                id: v.id,
                day: new Date(v.visitDate).toLocaleDateString('en-US', { weekday: 'short' }),
                time: this.formatTime(v.startTime),
                account: v.account,
                status: v.status,
                purpose: v.purpose,
                statusClass: this.getStatusClass(v.status)
            }));

            /* =========================
               WEEK STATS (THIS WAS MISSING ❗)
            ========================== */
            this.weekStats = {
                days: '7',
                totalVisits: String(totalVisits),
                completedVisits: String(
                    result.visits.filter(v => v.status === 'Completed').length
                ),
                totalHours: this.calculateTotalHours(totalVisits)
            };

            /* =========================
               WEEK RANGE DISPLAY
            ========================== */
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 6);

            this.weekRangeDisplay =
                `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ` +
                `${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

        } catch (error) {
            console.error('Error loading week data', error);
        }
    }



    // Helper method to get week start date (Monday)
    getWeekStartDate(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
        return new Date(d.setDate(diff));
    }

    // Helper method to update week range display
    updateWeekRangeDisplay(startDate) {
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6);

        this.weekRangeDisplay =
            `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ` +
            `${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }


    // Add this getter to maintain compatibility with existing template
    get weekRangeDisplayGetter() {
        if (!this.weekRangeDisplay) {
            // Calculate default if not set
            const startDate = this.getWeekStartDate(this.selectedDate);
            this.updateWeekRangeDisplay(startDate);
        }
        return this.weekRangeDisplay;
    }


    // Helper method to calculate total hours
    calculateTotalHours(visits) {
        // Assuming 1.5 hours per visit on average
        const totalHours = Math.round(visits * 1.5);
        return `${totalHours}h`;
    }

    // Generate weekly schedule from weekly data
    generateWeekSchedule(weekData) {
        this.weekSchedule = [];

        // Sample times and purposes for the schedule
        const times = ['09:00 AM', '11:30 AM', '02:00 PM', '04:30 PM'];
        const accounts = ['Global Enterprises', 'Tech Valley Inc', 'City Traders', 'Metro Retail', 'Local Suppliers'];
        const purposes = ['Meeting', 'Product Demo', 'Follow-up', 'Delivery', 'Review'];
        const statuses = ['Scheduled', 'In Progress', 'Completed', 'Pending'];

        weekData.forEach((dayData, dayIndex) => {
            const visits = dayData.visits || 0;

            if (visits > 0) {
                for (let i = 0; i < Math.min(visits, 3); i++) {
                    const accountIndex = (dayIndex + i) % accounts.length;
                    const status = statuses[i % statuses.length];

                    this.weekSchedule.push({
                        id: `schedule-${dayData.date}-${i}`,
                        day: dayData.dayName,
                        time: times[i % times.length],
                        account: accounts[accountIndex],
                        purpose: purposes[accountIndex],
                        status: status,
                        statusClass: this.getStatusClass(status)
                    });
                }
            }
        });
    }

    // ========== COMMON HELPER METHODS ==========
    getStatusClass(status) {
        const classMap = {
            'Completed': 'status-completed',
            'In Progress': 'status-inprogress',
            'Scheduled': 'status-scheduled',
            'Pending': 'status-pending',
            'Cancelled': 'status-cancelled'
        };
        return classMap[status] || 'status-pending';
    }

    // Fallback method for mock data
    loadMockWeekData() {
        const startDate = new Date(this.selectedDate);
        startDate.setDate(startDate.getDate() - startDate.getDay() + 1); // Start from Monday

        let totalVisits = 0;
        let totalCompleted = 0;

        this.weekDays = [];

        for (let i = 0; i < 7; i++) {
            const date = new Date(startDate);
            date.setDate(date.getDate() + i);

            const hasVisits = Math.random() > 0.3;
            const visits = hasVisits ? Math.floor(Math.random() * 8) + 1 : 0;
            const completed = Math.floor(Math.random() * visits);

            totalVisits += visits;
            totalCompleted += completed;

            this.weekDays.push({
                id: `week-${i}`,
                dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
                date: date.getDate(),
                month: date.toLocaleDateString('en-US', { month: 'short' }),
                fullDate: date.toISOString().split('T')[0],
                visits: visits,
                completed: completed,
                isToday: date.toDateString() === new Date().toDateString(),
                isSelected: date.toDateString() === this.selectedDate.toDateString(),
                progress: visits > 0 ? Math.round((completed / visits) * 100) : 0
            });
        }

        this.weekStats = {
            days: 7,
            totalVisits: totalVisits,
            completedVisits: totalCompleted,
            totalHours: this.calculateTotalHours(totalVisits)
        };

        this.updateWeekRangeDisplay(startDate);
        this.generateWeekSchedule(this.weekDays.map(day => ({
            date: day.fullDate,
            dayName: day.dayName,
            visits: day.visits,
            completed: day.completed,
            isToday: day.isToday
        })));
    }


    // ========== MONTHLY VIEW METHODS ==========
    async generateMonthView() {
        try {
            const date = this.selectedDate;
            const year = date.getFullYear();
            const month = date.getMonth() + 1;

            const result = await getMonthPlan({ year, month });

            // ===== TOP SUMMARY =====
            this.monthSummary = {
                totalDays: result.totalDays || 0,
                totalVisits: result.totalVisits || 0,
                totalAccounts: result.totalAccounts || 0
            };

            // ===== CALENDAR DATA =====
            this.monthCalendarData = result.calendarData || {};

            // Rebuild calendar grid using backend data
            this.buildMonthCalendar();

        } catch (error) {
            console.error('Month view error', error);
        }
    }

    buildMonthCalendar() {
        const date = this.selectedDate;
        const year = date.getFullYear();
        const month = date.getMonth();

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDay = firstDay.getDay();

        this.monthDays = [];

        // Empty cells
        for (let i = 0; i < startingDay; i++) {
            this.monthDays.push({
                id: `empty-${i}`,
                isEmpty: true
            });
        }

        // Real days
        for (let day = 1; day <= daysInMonth; day++) {
            const currentDate = new Date(year, month, day);
            const key = this.formatDateForApex(currentDate);

            const apexVisits = this.monthCalendarData[key] || [];

            this.monthDays.push({
                id: key,
                date: key,
                day,
                hasVisits: apexVisits.length > 0,
                visits: apexVisits.length, // number for badge
                events: apexVisits.map((v, index) => ({
                    id: `${key}-${index}`,
                    time: v.visitTime || '',
                    account: v.accountName
                }))
            });
        }
    }




    // Generate monthly calendar with real data
    generateMonthCalendar(date, monthData) {
        const year = date.getFullYear();
        const month = date.getMonth();

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDay = firstDay.getDay();

        this.monthDays = [];

        // Add empty days for previous month
        for (let i = 0; i < startingDay; i++) {
            const prevDate = new Date(year, month, -i);
            const dateKey = prevDate.toISOString().split('T')[0];

            this.monthDays.unshift({
                id: `month-prev-${i}`,
                day: prevDate.getDate(),
                date: dateKey,
                isCurrentMonth: false,
                isToday: false,
                isSelected: false,
                hasVisits: false,
                visits: 0,
                events: []
            });
        }

        // Add current month days with real data
        const today = new Date();
        for (let i = 1; i <= daysInMonth; i++) {
            const currentDate = new Date(year, month, i);
            const dateKey = currentDate.toISOString().split('T')[0];
            const isToday = currentDate.getDate() === today.getDate() &&
                currentDate.getMonth() === today.getMonth() &&
                currentDate.getFullYear() === today.getFullYear();
            const isSelected = this.selectedDate.toISOString().split('T')[0] === dateKey;

            // Get visit count from backend data
            const visitCount = monthData[dateKey] || 0;
            const hasVisits = visitCount > 0;

            // Generate events for days with visits
            let events = [];
            if (hasVisits) {
                const times = ['09:00', '14:00', '16:30'];
                const accounts = ['Global', 'Tech', 'City', 'Metro'];

                for (let j = 0; j < Math.min(visitCount, 3); j++) {
                    events.push({
                        id: `event-${dateKey}-${j}`,
                        time: times[j % times.length],
                        account: accounts[j % accounts.length],
                        type: j === 0 ? 'priority' : 'normal'
                    });
                }
            }

            this.monthDays.push({
                id: `month-current-${i}`,
                day: i,
                date: dateKey,
                isCurrentMonth: true,
                isToday: isToday,
                isSelected: isSelected,
                hasVisits: hasVisits,
                visits: visitCount,
                events: events
            });
        }

        // Add empty days for next month
        const totalCells = 42;
        const remainingCells = totalCells - this.monthDays.length;
        for (let i = 1; i <= remainingCells; i++) {
            const nextDate = new Date(year, month + 1, i);
            const dateKey = nextDate.toISOString().split('T')[0];

            this.monthDays.push({
                id: `month-next-${i}`,
                day: i,
                date: dateKey,
                isCurrentMonth: false,
                isToday: false,
                isSelected: false,
                hasVisits: false,
                visits: 0,
                events: []
            });
        }
    }

    // Calculate month statistics
    calculateMonthStats(monthData) {
        let totalVisits = 0;

        // Sum up all visit counts
        Object.values(monthData).forEach(count => {
            totalVisits += count;
        });

        // Count unique days with visits
        const daysWithVisits = Object.keys(monthData).length;

        this.monthStats = {
            days: daysWithVisits,
            totalVisits: totalVisits,
            accounts: Math.min(45, Math.floor(totalVisits * 0.8)) // Estimate based on visits
        };
    }

    // Fallback method for mock month data
    loadMockMonthData() {
        const date = this.selectedDate;
        const year = date.getFullYear();
        const month = date.getMonth();

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDay = firstDay.getDay();

        this.monthDays = [];
        let totalVisits = 0;

        // Add empty days for previous month
        for (let i = 0; i < startingDay; i++) {
            const prevDate = new Date(year, month, -i);
            this.monthDays.unshift({
                id: `month-prev-${i}`,
                day: prevDate.getDate(),
                date: prevDate.toISOString().split('T')[0],
                isCurrentMonth: false,
                isToday: false,
                isSelected: false,
                hasVisits: false,
                visits: 0,
                events: []
            });
        }

        // Add current month days
        const today = new Date();
        for (let i = 1; i <= daysInMonth; i++) {
            const currentDate = new Date(year, month, i);
            const dateKey = currentDate.toISOString().split('T')[0];
            const isToday = currentDate.getDate() === today.getDate() &&
                currentDate.getMonth() === today.getMonth() &&
                currentDate.getFullYear() === today.getFullYear();
            const isSelected = this.selectedDate.toISOString().split('T')[0] === dateKey;
            const hasVisits = Math.random() > 0.4;
            const visits = hasVisits ? Math.floor(Math.random() * 6) + 1 : 0;

            totalVisits += visits;

            let events = [];
            if (hasVisits && visits > 0) {
                const times = ['09:00', '14:00', '16:30'];
                const accounts = ['Global', 'Tech', 'City', 'Metro'];
                for (let j = 0; j < Math.min(visits, 3); j++) {
                    events.push({
                        id: `event-${i}-${j}`,
                        time: times[j % times.length],
                        account: accounts[j % accounts.length],
                        type: j === 0 ? 'priority' : 'normal'
                    });
                }
            }

            this.monthDays.push({
                id: `month-current-${i}`,
                day: i,
                date: dateKey,
                isCurrentMonth: true,
                isToday: isToday,
                isSelected: isSelected,
                hasVisits: hasVisits,
                visits: visits,
                events: events
            });
        }

        // Add empty days for next month
        const totalCells = 42;
        const remainingCells = totalCells - this.monthDays.length;
        for (let i = 1; i <= remainingCells; i++) {
            const nextDate = new Date(year, month + 1, i);
            this.monthDays.push({
                id: `month-next-${i}`,
                day: i,
                date: nextDate.toISOString().split('T')[0],
                isCurrentMonth: false,
                isToday: false,
                isSelected: false,
                hasVisits: false,
                visits: 0,
                events: []
            });
        }

        this.monthStats = {
            days: daysInMonth,
            totalVisits: totalVisits,
            accounts: Math.min(45, Math.floor(totalVisits * 0.8))
        };
    }




    // Update your existing selectWeekDay method
    selectWeekDay(event) {
        const dateStr = event.currentTarget.dataset.date;
        this.selectedDate = new Date(dateStr);
        this.selectedView = 'day';

    }
    // Update your existing selectMonthDay method
    selectMonthDay(event) {
        const dateStr = event.currentTarget.dataset.date;
        this.selectedDate = new Date(dateStr);
        this.selectedView = 'day';

    }

    viewAccountDetails(event) {
        const accountId = event.currentTarget.dataset.id;
        console.log('View account details:', accountId);
    }

    addVisit() {
        console.log('Add visit clicked');
    }

    // ========== NEW ACCOUNT ONBOARDING METHODS ==========
    handleInputChange(event) {
        const field = event.target.name;
        const value = event.target.value;

        this.formData = { ...this.formData, [field]: value };

        if (this.errors[field]) {
            this.errors = { ...this.errors, [field]: '' };
        }
    }

    validateForm() {
        const newErrors = {};

        // Business Name validation
        if (!this.formData.businessName.trim()) {
            newErrors.businessName = 'Business name is required';
        } else if (this.formData.businessName.length < 2) {
            newErrors.businessName = 'Business name must be at least 2 characters';
        }

        // Account Type validation
        if (!this.formData.accountType) {
            newErrors.accountType = 'Please select an account type';
        }

        // GSTIN validation (if provided)
        if (this.formData.gstin && !this.isValidGSTIN(this.formData.gstin)) {
            newErrors.gstin = 'Please enter a valid GSTIN format';
        }

        // Contact Person validation
        if (!this.formData.contactPerson.trim()) {
            newErrors.contactPerson = 'Contact person name is required';
        }

        // Phone Number validation
        if (!this.formData.phoneNumber.trim()) {
            newErrors.phoneNumber = 'Phone number is required';
        } else if (!this.isValidPhoneNumber(this.formData.phoneNumber)) {
            newErrors.phoneNumber = 'Please enter a valid phone number';
        }

        // Email validation (if provided)
        if (this.formData.email && !this.isValidEmail(this.formData.email)) {
            newErrors.email = 'Please enter a valid email address';
        }

        // Address validation
        if (!this.formData.streetAddress.trim()) {
            newErrors.streetAddress = 'Street address is required';
        }

        if (!this.formData.city.trim()) {
            newErrors.city = 'City is required';
        }

        if (this.formData.country === 'India' && !this.formData.state.trim()) {
            newErrors.state = 'State is required';
        }


        if (!this.formData.pincode.trim()) {
            newErrors.pincode = 'Pincode is required';
        } else if (!this.isValidPincode(this.formData.pincode)) {
            newErrors.pincode = 'Please enter a valid pincode';
        }

        return newErrors;
    }

    isValidGSTIN(gstin) {
        const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
        return gstinRegex.test(gstin.toUpperCase());
    }

    isValidPhoneNumber(phone) {
        const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
        return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    isValidPincode(pincode) {
        const pincodeRegex = /^[1-9][0-9]{5}$/;
        return pincodeRegex.test(pincode);
    }

    async handleSubmit(event) {
        event.preventDefault();
        console.log('FORM DATA BEFORE APEX => ', JSON.stringify(this.formData));


        const validationErrors = this.validateForm();
        if (Object.keys(validationErrors).length > 0) {
            this.errors = validationErrors;
            return;
        }

        this.errors = {};
        this.isSubmitting = true;

        try {
            const accountId = await createAccount({
                data: this.formData
            });

            console.log('Account created successfully:', accountId);

            this.createdAccountId = accountId;
            this.showSuccessState = true;

            this.showToast('Account created successfully', 'success');

        } catch (error) {
            console.error('FULL ERROR:', JSON.stringify(error));

            this.showToast(
                error?.body?.message ||
                error?.message ||
                'Failed to create account',
                'error'
            );
        } finally {
            this.isSubmitting = false;
        }
    }



    createAnotherAccount() {
        this.formData = {
            businessName: '',
            accountType: '',
            gstin: '',
            contactPerson: '',
            phoneNumber: '',
            email: '',
            streetAddress: '',
            city: '',
            state: '',
            pincode: ''
        };

        this.errors = {};
        this.showSuccessState = false;
    }

    goToAccountDashboard() {
        this.activeTab = 'account-360';
    }

    // ========== AI ANALYTICS METHODS ==========
    initializeAIData() {
        this.lastRefreshTime = new Date();
        this.aiStatus = 'active';
        this.loadAIInsights();
    }

    loadAIInsights() {
        this.isAILoading = true;
        this.aiLoadError = '';

        getFieldForceAIInsights()
            .then(result => {
                if (!result) return;
                console.log('AI Insight result :', JSON.stringify(result));

                // ── KPIs ──────────────────────────────────────────────────
                if (result.kpis && result.kpis.length > 0) {
                    const mappedKpis = result.kpis.map(kpi => ({
                        ...kpi,
                        trendClass: `kpi-trend ${kpi.trendType || 'positive'}`,
                        trendIcon: (kpi.trendType === 'negative' || String(kpi.trend || '').startsWith('-')) ? '↓' : '↑',
                        progressStyle: `width: ${kpi.progress || 0}%`
                    }));
                    this.aiData = { ...this.aiData, kpis: mappedKpis };
                }

                // ── Insights ───────────────────────────────────────────────
                if (result.insights && result.insights.length > 0) {
                    const mappedInsights = result.insights.map((ins, i) => ({
                        id: ins.id || (i + 1),
                        title: ins.title || 'Insight',
                        priority: ins.priority || 'low',
                        priorityLabel: (ins.priority || 'low').charAt(0).toUpperCase() + (ins.priority || 'low').slice(1) + ' Priority',
                        cardClass: `insight-card ${ins.priority || 'low'}-priority`,
                        priorityBadgeClass: `priority-badge ${ins.priority || 'low'}`,
                        metric1Label: ins.metric1Label || '',
                        metric1Value: ins.metric1Value || '',
                        metric2Label: ins.metric2Label || '',
                        metric2Value: ins.metric2Value || '',
                        hasMetric2: !!(ins.metric2Label && ins.metric2Value),
                        recommendation: ins.recommendation || '',
                        impact: ins.impact || '',
                        icon: ins.recommendationIcon || ins.icon || '💡',
                        impactIcon: ins.impactIcon || '✅',
                        impactClass: `impact-section${ins.isWarning ? ' warning' : ''}`,
                        isWarning: ins.isWarning || false
                    }));
                    this.aiData = { ...this.aiData, insights: mappedInsights };
                }

                // ── Weekly Performance ─────────────────────────────────────
                if (result.weeklyPerformance && result.weeklyPerformance.length > 0) {
                    const mappedWeekly = result.weeklyPerformance.map(day => ({
                        ...day,
                        summary: `${day.visits} visits • ${day.orders} orders • ${day.revenue}`,
                        conversionClass: `table-cell ${day.trend || 'neutral'}`
                    }));
                    this.aiData = { ...this.aiData, weeklyPerformance: mappedWeekly };
                }

                // ── Top Products ───────────────────────────────────────────
                if (result.topProducts && result.topProducts.length > 0) {
                    this.aiData = { ...this.aiData, topProducts: result.topProducts };
                }

                // ── Dealer Performance ─────────────────────────────────────
                if (result.dealerPerformance && result.dealerPerformance.length > 0) {
                    const mappedDealers = result.dealerPerformance.map(d => ({
                        ...d,
                        trendClass: `trend-indicator ${d.trend || 'growing'}`,
                        trendText: d.trendText || (d.trend === 'declining' ? 'Declining ↘' : 'Growing ↗'),
                        actionBtnClass: d.isUrgent ? 'action-btn small urgent' : 'action-btn small'
                    }));
                    this.aiData = { ...this.aiData, dealerPerformance: mappedDealers };
                }

                // ── Action Items ───────────────────────────────────────────
                if (result.actionItems && result.actionItems.length > 0) {
                    const mappedActions = result.actionItems.map(item => ({
                        ...item,
                        itemClass: `action-item${item.isUrgent ? ' urgent' : ''}`,
                        buttonClass: `action-btn ${item.actionType || ''}`
                    }));
                    this.aiData = { ...this.aiData, actionItems: mappedActions };
                }

                // ── Competitor Analysis ────────────────────────────────────────
                if (result.competitorAnalysis && result.competitorAnalysis.length > 0) {
                    const mappedComp = result.competitorAnalysis.map((c, i) => {
                        const threat = (c.threatLevel || 'low').toLowerCase();
                        const priceAdv = c.priceAdvantage || 'equal';
                        const demand = (c.demandTrend || '').toLowerCase();
                        const pref = (c.dealerPreference || '').toLowerCase();

                        return {
                            ...c,
                            id: c.id || (i + 1),
                            cardClass: `comp-card comp-card--${threat}`,
                            threatBadgeClass: `comp-threat-badge comp-threat--${threat}`,
                            threatLabel: threat.charAt(0).toUpperCase() + threat.slice(1) + ' Threat',
                            priceDiffClass: priceAdv === 'we_cheaper'
                                ? 'comp-metric-value price-advantage'
                                : priceAdv === 'they_cheaper'
                                    ? 'comp-metric-value price-disadvantage'
                                    : 'comp-metric-value price-equal',
                            demandBadgeClass: demand === 'rising'
                                ? 'comp-tag-demand rising'
                                : demand === 'falling'
                                    ? 'comp-tag-demand falling'
                                    : 'comp-tag-demand stable',
                            prefBadgeClass: pref.includes('our') || pref.includes('we')
                                ? 'comp-tag-pref us'
                                : pref.includes('competitor') || pref.includes('them')
                                    ? 'comp-tag-pref them'
                                    : 'comp-tag-pref neutral',
                            isPromoActive: (c.promoActive || '').toLowerCase() === 'yes'
                        };
                    });
                    this.aiData = { ...this.aiData, competitorAnalysis: mappedComp };
                }

                this.lastRefreshTime = new Date();
            })
            .catch(err => {
                this.aiLoadError = err?.body?.message || err?.message || 'Failed to load AI insights';
                console.error('AI Insights error:', this.aiLoadError);
                // Keep existing hardcoded aiData as fallback — don't wipe it
            })
            .finally(() => {
                this.isAILoading = false;
            });
    }


    refreshAIInsights() {
        this.loadAIInsights();
        this.dispatchEvent(new ShowToastEvent({
            title: 'Refreshing',
            message: 'Fetching latest AI insights…',
            variant: 'info'
        }));
    }

    get hasCompetitorData() {
        return this.aiData.competitorAnalysis && this.aiData.competitorAnalysis.length > 0;
    }

    get competitorSummary() {
        const data = this.aiData.competitorAnalysis || [];
        return {
            total: data.length,
            highThreat: data.filter(c => c.threatLevel === 'high').length,
            mediumThreat: data.filter(c => c.threatLevel === 'medium').length,
            lowThreat: data.filter(c => c.threatLevel === 'low').length,
            weCheaper: data.filter(c => c.priceAdvantage === 'we_cheaper').length
        };
    }

    generateNewInsights() {
        const newKpis = [...this.aiData.kpis];

        newKpis.forEach(kpi => {
            if (kpi.id === 1) {
                const currentValue = parseFloat(kpi.value.replace('₹', '').replace('L', ''));
                const change = (Math.random() * 0.1 - 0.05);
                const newValue = currentValue * (1 + change);
                kpi.value = `₹${newValue.toFixed(1)}L`;
                kpi.trend = `${change > 0 ? '+' : ''}${(change * 100).toFixed(0)}%`;
                kpi.trendType = change >= 0 ? "positive" : "negative";
            } else if (kpi.id === 2) {
                const currentValue = parseInt(kpi.value);
                const change = Math.floor(Math.random() * 6 - 2);
                const newValue = Math.min(100, Math.max(0, currentValue + change));
                kpi.value = `${newValue}%`;
                kpi.trend = `${change > 0 ? '+' : ''}${change}%`;
                kpi.trendType = change >= 0 ? "positive" : "negative";
                kpi.progress = newValue;
            }
        });

        const newInsightId = this.aiData.insights.length + 1;
        const potentialInsights = [
            {
                title: "New Market Opportunity Detected",
                priority: "medium",
                details: {
                    location: "Eastern Region",
                    potentialCustomers: "25+ new dealers"
                },
                recommendation: "Expand coverage to Eastern Region for growth",
                impact: "Estimated new business: ₹5L monthly",
                icon: "📍",
                impactIcon: "💰"
            },
            {
                title: "Seasonal Demand Spike Predicted",
                priority: "high",
                details: {
                    product: "JK Copier A4",
                    expectedIncrease: "35% next month"
                },
                recommendation: "Increase inventory by 20%",
                impact: "Capitalize on seasonal opportunity",
                icon: "📊",
                impactIcon: "🚀"
            }
        ];

        const randomInsight = potentialInsights[Math.floor(Math.random() * potentialInsights.length)];
        randomInsight.id = newInsightId;

        const updatedInsights = [randomInsight, ...this.aiData.insights.slice(0, 3)];

        const updatedDealers = [...this.aiData.dealerPerformance];
        updatedDealers.forEach(dealer => {
            const change = Math.floor(Math.random() * 10000);
            const revenueNumber = parseFloat(dealer.revenue.replace(/[^0-9.-]+/g, ""));
            const newRevenue = revenueNumber + (dealer.trend === "growing" ? change : -change);
            dealer.revenue = `₹${newRevenue.toLocaleString('en-IN')}`;

            if (Math.random() > 0.7) {
                dealer.trend = dealer.trend === "growing" ? "declining" : "growing";
                dealer.trendText = dealer.trend === "growing" ? "Growing ↗" : "Declining ↘";
                dealer.isUrgent = dealer.trend === "declining";
            }
        });

        const updatedWeekly = [...this.aiData.weeklyPerformance];
        updatedWeekly.forEach(day => {
            const visitsChange = Math.floor(Math.random() * 3) - 1;
            day.visits = Math.max(1, day.visits + visitsChange);
            day.orders = Math.max(0, day.orders + Math.floor(Math.random() * 2) - (visitsChange < 0 ? 1 : 0));
            day.revenue = `₹${(day.visits * 55000 + Math.random() * 100000).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
            const conversion = day.visits > 0 ? Math.round((day.orders / day.visits) * 100) : 0;
            day.conversion = `${conversion}%`;
            day.trend = conversion >= 70 ? "positive" : conversion >= 60 ? "neutral" : "negative";
        });

        const updatedProducts = [...this.aiData.topProducts];
        updatedProducts.forEach(product => {
            const growthChange = (Math.random() * 5) - 2;
            const currentGrowth = parseFloat(product.growth);
            const newGrowth = Math.max(0, currentGrowth + growthChange);
            product.growth = `${newGrowth.toFixed(0)}%`;

            const revenueNumber = parseFloat(product.revenue.replace('₹', '').replace('L', ''));
            const revenueChange = (Math.random() * 0.2) + 0.9;
            const newRevenue = revenueNumber * revenueChange;
            product.revenue = `₹${newRevenue.toFixed(1)}L`;
        });

        const updatedActions = [...this.aiData.actionItems];
        updatedActions.forEach(action => {
            if (action.dealerName) {
                const dealer = updatedDealers.find(d => d.name === action.dealerName);
                if (dealer) {
                    action.detail = dealer.trend === "growing"
                        ? "Performance improving"
                        : "Needs immediate attention";
                }
            }
        });

        this.aiData = {
            ...this.aiData,
            kpis: newKpis,
            insights: updatedInsights,
            dealerPerformance: updatedDealers,
            weeklyPerformance: updatedWeekly,
            topProducts: updatedProducts,
            actionItems: updatedActions
        };
    }

    viewDealerRecommendations(event) {
        const dealerName = event.currentTarget.dataset.dealer ||
            event.currentTarget.closest('.table-row')?.dataset.dealer;
        const dealer = this.aiData.dealerPerformance.find(d => d.name === dealerName);

        if (dealer) {
            const insights = this.getDealerInsights(dealer);

            let message = `🤖 AI Insights for ${dealer.name}\n\n`;
            message += `💰 Current Revenue: ${dealer.revenue}\n`;
            message += `📊 Trend: ${dealer.trendText}\n\n`;
            message += `🎯 Recommendations:\n`;

            if (dealer.trend === "growing") {
                message += `• Increase order frequency by 20%\n`;
                message += `• Introduce premium product line\n`;
                message += `• Consider volume discounts for loyalty\n`;
            } else {
                message += `🔴 URGENT: Schedule immediate visit\n`;
                message += `• Identify pain points and concerns\n`;
                message += `• Offer special incentives to retain\n`;
                message += `• Review competitor activities\n`;
            }

            message += `\n📈 Potential Impact: ₹${this.calculateDealerPotential(dealer)}L additional revenue`;

            alert(message);
        }
    }

    getDealerInsights(dealer) {
        const baseInsights = [
            "Consider offering bundled packages",
            "Schedule quarterly business reviews",
            "Share market insights and trends",
            "Provide training on new products",
            "Offer exclusive promotional deals"
        ];

        if (dealer.trend === "declining") {
            baseInsights.unshift(
                "URGENT: Conduct root cause analysis",
                "Prepare retention strategy",
                "Offer competitive pricing review"
            );
        }

        return baseInsights.slice(0, 3);
    }

    calculateDealerPotential(dealer) {
        const revenue = parseFloat(dealer.revenue.replace(/[^0-9.-]+/g, ""));
        if (dealer.trend === "growing") {
            return (revenue * 0.15 / 100000).toFixed(1);
        } else {
            return (revenue * 0.25 / 100000).toFixed(1);
        }
    }

    exportWeeklyData() {
        const exportData = {
            title: "Weekly Performance Summary",
            period: this.getCurrentWeekRange(),
            data: this.aiData.weeklyPerformance,
            generated: new Date().toLocaleString(),
            metrics: {
                totalVisits: this.aiData.weeklyPerformance.reduce((sum, day) => sum + day.visits, 0),
                totalOrders: this.aiData.weeklyPerformance.reduce((sum, day) => sum + day.orders, 0),
                avgConversion: `${this.completionRate}%`
            }
        };

        console.log('Exporting data:', exportData);
        this.showToast("Weekly data prepared for export", "success");

        setTimeout(() => {
            alert(`📥 Weekly Performance Report\n\n` +
                `Period: ${exportData.period}\n` +
                `Total Visits: ${exportData.metrics.totalVisits}\n` +
                `Total Orders: ${exportData.metrics.totalOrders}\n` +
                `Average Conversion: ${exportData.metrics.avgConversion}\n\n` +
                `Report downloaded successfully!`);
        }, 500);
    }

    getCurrentWeekRange() {
        const now = new Date();
        const first = now.getDate() - now.getDay();
        const last = first + 6;

        const firstDay = new Date(now.setDate(first));
        const lastDay = new Date(now.setDate(last));

        return `${firstDay.toLocaleDateString()} - ${lastDay.toLocaleDateString()}`;
    }

    exportDealerData() {
        const dealerReport = {
            title: "Dealer Performance Analysis Report",
            generated: new Date().toLocaleString(),
            summary: {
                totalDealers: this.aiData.dealerPerformance.length,
                growingDealers: this.aiData.dealerPerformance.filter(d => d.trend === "growing").length,
                decliningDealers: this.aiData.dealerPerformance.filter(d => d.trend === "declining").length,
                totalRevenue: this.aiData.dealerPerformance.reduce((sum, d) => {
                    const revenue = parseFloat(d.revenue.replace(/[^0-9.-]+/g, ""));
                    return sum + revenue;
                }, 0)
            },
            dealers: this.aiData.dealerPerformance,
            aiRecommendations: this.aiData.dealerPerformance.map(dealer => ({
                dealer: dealer.name,
                priority: dealer.isUrgent ? "High" : "Normal",
                recommendations: this.getDealerInsights(dealer),
                potential: `₹${this.calculateDealerPotential(dealer)}L`
            }))
        };

        console.log('Exporting dealer report:', dealerReport);
        this.showToast("Dealer performance report generated", "success");

        setTimeout(() => {
            alert(`📊 Dealer Performance Report\n\n` +
                `Total Dealers: ${dealerReport.summary.totalDealers}\n` +
                `Growing: ${dealerReport.summary.growingDealers}\n` +
                `Declining: ${dealerReport.summary.decliningDealers}\n` +
                `Total Revenue: ₹${(dealerReport.summary.totalRevenue / 100000).toFixed(1)}L\n\n` +
                `Report downloaded with AI recommendations!`);
        }, 500);
    }

    handleActionDispatch(event) {
        const type = event.currentTarget.dataset.type;
        const dealer = event.currentTarget.dataset.dealer;
        if (type === 'urgent') this.scheduleMeeting(event);
        else if (dealer) this.focusOnDealer(event);
        else this.viewPendingVisits();
    }

    getNextAvailableSlot() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0);

        return tomorrow.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    addToPromotionList() {
        const product = this.aiData.topProducts.find(p => p.name === "JK Easy Copier");

        if (product) {
            const promotion = {
                product: product.name,
                addedAt: new Date(),
                promotionPlan: "Highlight in next 3 dealer visits",
                expectedImpact: `Increase sales by ${product.growth}`
            };

            console.log('Added to promotion list:', promotion);
            this.showToast(`${product.name} added to promotion list`, "success");

            const actionItem = this.aiData.actionItems.find(item =>
                item.title.includes("Promote JK Easy Copier")
            );

            if (actionItem) {
                actionItem.isCompleted = true;
                actionItem.completedAt = new Date();
            }
        }
    }

    viewPendingVisits() {
        const today = new Date().toLocaleDateString('en-US', { weekday: 'short' });
        const todayPerformance = this.aiData.weeklyPerformance.find(day =>
            day.day.toLowerCase() === today.toLowerCase().substring(0, 3)
        );

        if (todayPerformance) {
            const pendingVisits = Math.max(0, 8 - todayPerformance.visits);

            alert(`📋 Pending Visits Today\n\n` +
                `Planned: 8 visits\n` +
                `Completed: ${todayPerformance.visits} visits\n` +
                `Pending: ${pendingVisits} visits\n\n` +
                `📍 Recommended dealers to visit:\n` +
                `1. Sharma Paper Mart (High priority)\n` +
                `2. Modern Office Supplies\n` +
                `3. City Distributors\n\n` +
                `Complete these to achieve daily target!`);

            const actionItem = this.aiData.actionItems.find(item =>
                item.title.includes("Complete pending visits")
            );

            if (actionItem) {
                actionItem.isCompleted = true;
                actionItem.completedAt = new Date();
            }
        }
    }

    showToast(message, type = "info") {
        console.log(`Toast (${type}): ${message}`);

        if (type === "success") {
            alert(`✅ ${message}`);
        } else if (type === "error") {
            alert(`❌ ${message}`);
        } else {
            alert(`ℹ️ ${message}`);
        }
    }


    handleExecutionDateClick(event) {
        const dateStr = event.currentTarget.dataset.date;
        this.selectedDate = new Date(dateStr);

        // Load visits for that selected date
        this.loadDayVisits();
        this.loadTodayProgress();
    }

    openCreateVisitFromExecution() {
        // Open modal without selecting account (user will select from Account360 later)


        // this.visitForm = {
        //     visitDate: this.formatDateForApex(this.selectedDate),
        //     plannedStartTime: ''
        // };

        this.showScheduleVisitModal = true;
    }

    /*    handleVisitSubmit(event) {
            alert('onsubmit');
            event.preventDefault();
    
            const fields = { ...event.detail.fields };
            fields.Visit_Status__c = 'Planned';
    
            // IMPORTANT: submit using event.target
            event.target.submit(fields);
        }
    */

    handleSuccess(event) {
        this.showScheduleVisitModal = false;
        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Success',
                message: 'Visit Created Successfully',
                variant: 'success'
            })
        );
        // Reload all visit-related data without page refresh
        this.loadDayVisits();
        this.loadCarouselDates();
        this.loadTodayProgress();
        this.loadDashboardMetrics();
    }

    handleError(event) {
        console.error(event.detail);
    }



    /* handleVisitSuccess(event) {
         this.showScheduleVisitModal = false;
 
         // Refresh Visit Execution & Journey Plan data
         this.loadDayVisits();
         this.loadRecentVisits();
         this.refreshCarousel();
 
         this.showToast(
             'Success',
             'Visit created successfully',
             'success'
         );
     }
     handleVisitError(event) {
         console.error('FULL ERROR:', JSON.stringify(event.detail));
         alert(JSON.stringify(event.detail, null, 2));
     } */





    // Helper methods for template
    getKpiProgressStyle(progress) {
        return `width: ${progress}%`;
    }

    getProgressRingStyle(progress) {
        const degrees = (progress / 100) * 360;
        return `background: conic-gradient(#45c65a 0deg ${degrees}deg, #f3f3f3 ${degrees}deg 360deg);`;
    }

    getTrendClass(trendType) {
        return `kpi-trend ${trendType}`;
    }

    getPriorityBadgeClass(priority) {
        return `priority-badge ${priority}`;
    }

    getImpactClass(isWarning) {
        return `impact-section ${isWarning ? 'warning' : ''}`;
    }

    getTrendIndicatorClass(trend) {
        return `trend-indicator ${trend}`;
    }

    getActionButtonClass(actionType) {
        if (actionType === 'primary') return 'action-btn primary';
        if (actionType === 'urgent') return 'action-btn urgent';
        return 'action-btn';
    }

    getTableRowClass(dealer) {
        return `table-row ${dealer.isUrgent ? 'urgent-row' : ''}`;
    }

    getActionItemClass(actionItem) {
        return `action-item ${actionItem.isUrgent ? 'urgent' : ''} ${actionItem.isCompleted ? 'completed' : ''}`;
    }

    markActionComplete(actionId) {
        const actionItem = this.aiData.actionItems.find(item => item.id === actionId);
        if (actionItem && !actionItem.isCompleted) {
            actionItem.isCompleted = true;
            actionItem.completedAt = new Date();
            this.showToast(`Action completed: ${actionItem.title}`, "success");

            this.aiData = { ...this.aiData };
        }
    }

    simulateAIProcessing() {
        this.isGeneratingInsights = true;

        const processingInterval = setInterval(() => {
            const randomKpi = this.aiData.kpis[Math.floor(Math.random() * this.aiData.kpis.length)];
            const currentValue = parseFloat(randomKpi.value.replace(/[^0-9.-]+/g, ""));
            const newValue = currentValue * (1 + (Math.random() * 0.02 - 0.01));

            if (randomKpi.title.includes('₹')) {
                randomKpi.value = `₹${newValue.toFixed(1)}L`;
            } else if (randomKpi.value.includes('%')) {
                randomKpi.value = `${Math.min(100, Math.max(0, newValue)).toFixed(0)}%`;
            }

            this.aiData = { ...this.aiData };
        }, 300);

        setTimeout(() => {
            clearInterval(processingInterval);
            this.isGeneratingInsights = false;
            this.showToast("AI analysis complete. New insights generated!", "success");
        }, 3000);
    }

    exportAllAIData() {
        const exportData = {
            exportDate: new Date().toISOString(),
            kpis: this.aiData.kpis,
            insights: this.aiData.insights,
            weeklyPerformance: this.aiData.weeklyPerformance,
            topProducts: this.aiData.topProducts,
            dealerPerformance: this.aiData.dealerPerformance,
            actionItems: this.aiData.actionItems,
            metadata: {
                totalPotentialRevenue: this.totalPotentialRevenue,
                highPriorityActions: this.highPriorityActions,
                completionRate: `${this.completionRate}%`
            }
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const exportFileDefaultName = `AI-Analytics-Export-${new Date().toISOString().split('T')[0]}.json`;

        console.log('Export data prepared:', exportData);
        this.showToast("All AI data exported successfully", "success");

        alert(`📊 AI Analytics Data Export\n\n` +
            `File: ${exportFileDefaultName}\n` +
            `Items: ${Object.keys(exportData).length - 1} categories\n` +
            `Size: ${Math.round(dataStr.length / 1024)} KB\n\n` +
            `Export complete! Data includes all AI insights and recommendations.`);
    }

    loadDayVisits() {
        const visitDateStr = this.formatDateForApex(this.selectedDate);

        getDayVisits({ visitDateStr })
            .then(result => {

                // Existing logic (DO NOT REMOVE)
                this.dailyVisits = result.map(v => ({
                    id: v.id,
                    time: this.formatTime(v.startTime),
                    account: v.account,
                    status: v.status,
                    statusClass: this.getStatusClass(v.status)
                }));

                // ✅ ADD THIS (for Dashboard → Recent Visits)
                this.recentVisits = this.dailyVisits.slice(0, 3);

            })
            .catch(error => {
                console.error('Error loading visits', error);
                this.dailyVisits = [];
                this.recentVisits = [];
            });
    }

    get dailyVisitsWithMeta() {
        return this.dailyVisits.map(v => {
            const isInProgress = v.status === 'In Progress';
            const isCompleted = v.status === 'Completed';
            const canCheckIn = !isInProgress && !isCompleted;
            const isCheckingIn = this.checkingInVisitId === v.id;

            return {
                ...v,
                accountInitial: (v.account || 'A').charAt(0).toUpperCase(),
                location: v.location || '—',
                purpose: v.purpose || '—',
                canCheckIn,
                isInProgress,
                isCompleted,
                isCheckingIn
            };
        });
    }

    async handleVisitCheckIn(event) {
        const visitId = event.currentTarget.dataset.id;
        const account = event.currentTarget.dataset.account;

        this.checkingInVisitId = visitId;          // show spinner on row

        try {
            const pos = await this.getGPSPosition();   // reuse your getCurrentLocation()

            // Call Apex to record check-in on the visit record
            await checkInVisit({
                visitId: visitId,
                lat: String(pos.latitude),
                lng: String(pos.longitude),
                address: pos.address || ''
            });

            // Update local status so the row shows "In Progress"
            this.dailyVisits = this.dailyVisits.map(v =>
                v.id === visitId ? { ...v, status: 'In Progress' } : v
            );

            // Open detail view
            this.activeVisitId = visitId;
            this.activeVisitCheckInTime = new Date().toISOString();
            this.activeVisitLat = String(pos.latitude);
            this.activeVisitLng = String(pos.longitude);
            this.activeVisitAddress = pos.address || `${pos.latitude.toFixed(4)}, ${pos.longitude.toFixed(4)}`;

        } catch (err) {
            console.error('Check-in error', err);
            this.showToast('Check-in failed: ' + (err.message || 'Location unavailable'), 'error');
        } finally {
            this.checkingInVisitId = null;
        }
    }

    handleResumeVisit(event) {
        const visitId = event.currentTarget.dataset.id;
        // Restore check-in data if you stored it, or re-open with saved props
        this.activeVisitId = visitId;
    }

    handleVisitDetailBack() {
        this.activeVisitId = null;
        this.loadDayVisits();          // refresh the list
    }

    handleVisitCheckOutEvent(event) {
        const { visitId } = event.detail;
        this.dailyVisits = this.dailyVisits.map(v =>
            v.id === visitId ? { ...v, status: 'Completed' } : v
        );
        // Keep detail view open — user closes it manually via back btn
        this.loadDayVisits();
    }

    getGPSPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) { reject(new Error('No geolocation')); return; }
            navigator.geolocation.getCurrentPosition(
                p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, address: '' }),
                e => reject(e),
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        });
    }
    formatTime(timeValue) {
        if (timeValue === null || timeValue === undefined) {
            return '—';
        }
        // Salesforce sends Time as milliseconds from midnight
        const totalMinutes = Math.floor(timeValue / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        const date = new Date();
        date.setHours(hours, minutes, 0, 0);

        return date.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    }

    formatSalesforceDateTime(dtValue) {
        if (!dtValue) return '-';

        try {
            // Salesforce gives ISO like "2026-01-14T03:08:50.000Z"
            const dt = new Date(dtValue);

            return dt.toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        } catch (e) {
            console.error('formatSalesforceDateTime error => ', e, dtValue);
            return '-';
        }
    }

}