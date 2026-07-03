import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getVisitCountsByDates from '@salesforce/apex/JourneyPlanController.getVisitCountsByDates';
import getTodayJourneyPlan from '@salesforce/apex/JourneyPlanController.getTodayJourneyPlan';
import getDailyPlanItems from '@salesforce/apex/JourneyPlanController.getDailyPlanItems';
import getWeekJourneyPlans from '@salesforce/apex/JourneyPlanController.getWeekJourneyPlans';
import getMonthVisitCounts from '@salesforce/apex/JourneyPlanController.getMonthVisitCounts';
import getPriorityAccountsByDate from '@salesforce/apex/JourneyPlanController.getPriorityAccountsByDate';
import createVisit from '@salesforce/apex/VisitDayVisitsController.createVisit';

export default class SfaJourneyPlan extends LightningElement {

    @track showCalendar = false;
    @track selectedView = 'day';
    @track selectedDate = new Date();
    @track calendarMonth = '';
    @track calendarYear = '';
    @track calendarDays = [];
    @track carouselDates = [];
    @track carouselStartDate = new Date();
    @track dailyVisits = [];
    @track dayStats = { plannedVisits: 0, estimatedDuration: '0h', completedToday: 0 };
    @track todayProgress = { planned: 0, completed: 0, pending: 0, successRate: 0 };
    @track weekStats = { days: 7, totalVisits: 0, totalHours: 0 };
    @track monthDays = [];
    @track monthSummary = { totalDays: 0, totalVisits: 0, totalAccounts: 0 };
    @track weekSchedule = [];
    @track weekRangeDisplay = '';
    @track weekDays = [];
    @track priorityAccountsJP = [];
    @track showScheduleVisitModal = false;

    connectedCallback() {
        this.initializeCalendar();
        this.loadCarouselDates();
        this.loadDayVisits();
        this.loadTodayProgress();
        this.loadPriorityAccountsJP();
    }

    initializeCalendar() {
        const now = new Date();
        this.calendarMonth = now.toLocaleString('en-US', { month: 'long' });
        this.calendarYear = now.getFullYear().toString();
        this.generateCalendarDays();
    }

    generateCalendarDays() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        this.calendarDays = [];
        for (let i = 0; i < startingDayOfWeek; i++) {
            this.calendarDays.push({ key: `empty-${i}`, day: '', date: null });
        }
        for (let day = 1; day <= daysInMonth; day++) {
            this.calendarDays.push({
                key: `${month}-${day}`,
                day: day.toString(),
                date: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
                hasVisits: Math.random() > 0.6,
                visits: Math.floor(Math.random() * 5) + 1
            });
        }
    }

    loadCarouselDates() {
        const dates = [];
        const today = new Date(this.selectedDate);
        for (let i = -2; i <= 2; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() + i);
            dates.push({
                id: i,
                dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
                dateNum: d.getDate().toString(),
                month: d.toLocaleDateString('en-US', { month: 'short' }),
                visits: Math.floor(Math.random() * 4) + 1
            });
        }
        this.carouselDates = dates;
    }

    loadDayVisits() {
        getDailyPlanItems({ visitDate: this.formatDateForApex(this.selectedDate) })
            .then(result => {
                this.dailyVisits = (result || []).map(v => ({
                    id: v.Id,
                    time: this.fmtTime(v.Planned_Start_Time__c),
                    account: v.Account__r?.Name || '—',
                    accountInitial: (v.Account__r?.Name || '?').charAt(0).toUpperCase(),
                    location: v.Account__r?.BillingCity || '—',
                    purpose: v.Visit_Purpose__c || 'Meeting',
                    status: v.Visit_Status__c || 'Planned',
                    statusClass: this.getStatusClass(v.Visit_Status__c),
                    canCheckIn: v.Visit_Status__c === 'Planned',
                    isInProgress: v.Visit_Status__c === 'In Progress',
                    isCompleted: v.Visit_Status__c === 'Completed'
                }));
                this.updateDayStats();
            })
            .catch(error => console.error('Day visits error', error));
    }

    get dailyVisitsWithMeta() { return this.dailyVisits; }

    updateDayStats() {
        const planned = this.dailyVisits.length;
        const completed = this.dailyVisits.filter(v => v.isCompleted).length;
        const pending = planned - completed;
        this.dayStats = {
            plannedVisits: planned,
            estimatedDuration: '4h 30m',
            completedToday: completed
        };
        this.todayProgress = {
            planned, completed, pending,
            successRate: planned > 0 ? Math.round((completed / planned) * 100) : 0
        };
    }

    get todayProgressWidth() { return `width:${this.todayProgress.successRate}%`; }

    loadTodayProgress() {
        getTodayJourneyPlan()
            .then(result => {
                if (result) {
                    this.todayProgress = {
                        planned: result.plannedVisits || 0,
                        completed: result.completedVisits || 0,
                        pending: (result.plannedVisits || 0) - (result.completedVisits || 0),
                        successRate: result.successRate || 0
                    };
                }
            })
            .catch(error => console.error('Day plan error', error));
    }

    loadPriorityAccountsJP() {
        getPriorityAccountsByDate()
            .then(result => {
                this.priorityAccountsJP = (result || []).map(a => ({
                    id: a.Id,
                    name: a.Name,
                    location: a.BillingCity || a.BillingState || '—',
                    status: a.Account_Status__c || 'Active',
                    priority: a.Priority__c || 'Medium',
                    priorityClass: this.getPriorityClass(a.Priority__c)
                }));
            })
            .catch(error => console.error('Priority accounts error', error));
    }

    getPriorityClass(priority) {
        const map = { 'High': 'priority-high', 'Medium': 'priority-medium', 'Low': 'priority-low' };
        return map[priority] || 'priority-medium';
    }

    getStatusClass(status) {
        const map = {
            'Planned': 'status planned',
            'In Progress': 'status in-progress',
            'Completed': 'status completed'
        };
        return map[status] || 'status';
    }

    formatDateForApex(date) {
        if (!date) return null;
        const d = new Date(date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    fmtTime(timeStr) {
        if (!timeStr) return '—';
        try { return new Date(`2000-01-01T${timeStr}`).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); }
        catch { return timeStr; }
    }

    get selectedDateDisplay() {
        return this.selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    }

    get isDayView()   { return this.selectedView === 'day'; }
    get isWeekView()  { return this.selectedView === 'week'; }
    get isMonthView() { return this.selectedView === 'month'; }

    toggleCalendar() { this.showCalendar = !this.showCalendar; }
    prevMonth() { this.selectedDate.setMonth(this.selectedDate.getMonth() - 1); this.initializeCalendar(); }
    nextMonth() { this.selectedDate.setMonth(this.selectedDate.getMonth() + 1); this.initializeCalendar(); }
    selectDate(event) { const d = event.currentTarget.dataset.date; if (d) { this.selectedDate = new Date(d); this.showCalendar = false; this.loadDayVisits(); } }
    prevDate() { this.selectedDate.setDate(this.selectedDate.getDate() - 1); this.loadCarouselDates(); this.loadDayVisits(); }
    nextDate() { this.selectedDate.setDate(this.selectedDate.getDate() + 1); this.loadCarouselDates(); this.loadDayVisits(); }

    changeView(event) {
        const view = event.currentTarget.dataset.view;
        this.selectedView = view;
        if (view === 'week') this.loadWeekView();
        if (view === 'month') this.loadMonthView();
    }

    loadWeekView() {
        getWeekJourneyPlans()
            .then(result => {
                this.weekSchedule = (result || []).map(v => ({
                    id: v.Id,
                    day: new Date(v.Visit_Date__c).toLocaleDateString('en-US', { weekday: 'short' }),
                    time: this.fmtTime(v.Planned_Start_Time__c),
                    account: v.Account__r?.Name || '—',
                    purpose: v.Visit_Purpose__c || '—',
                    status: v.Visit_Status__c,
                    statusClass: this.getStatusClass(v.Visit_Status__c)
                }));
                this.weekDays = Array.from({ length: 7 }, (_, i) => {
                    const d = new Date(this.selectedDate);
                    d.setDate(d.getDate() + (i - d.getDay()));
                    return {
                        id: i,
                        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
                        date: d.getDate().toString(),
                        visits: Math.floor(Math.random() * 3) + 1
                    };
                });
            })
            .catch(error => console.error('Week visits error', error));
    }

    loadMonthView() {
        getMonthVisitCounts()
            .then(result => {
                if (result) {
                    this.monthSummary = {
                        totalDays: result.totalDays || 0,
                        totalVisits: result.totalVisits || 0,
                        totalAccounts: result.totalAccounts || 0
                    };
                }
                this.generateMonthView();
            })
            .catch(error => console.error('Month plan error', error));
    }

    generateMonthView() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        this.monthDays = [];
        for (let i = 0; i < startingDayOfWeek; i++) {
            this.monthDays.push({ key: `empty-${i}`, day: '', date: null });
        }
        for (let day = 1; day <= daysInMonth; day++) {
            const hasEvents = Math.random() > 0.7;
            this.monthDays.push({
                key: `${month}-${day}`,
                id: `${month}-${day}`,
                day: day.toString(),
                date: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
                hasVisits: hasEvents,
                visits: hasEvents ? Math.floor(Math.random() * 3) + 1 : 0,
                events: hasEvents ? [
                    { id: 1, time: '10:00', account: 'Acme Corp' },
                    { id: 2, time: '14:00', account: 'Tech Inc' }
                ] : null
            });
        }
    }

    selectWeekDay(event) {
        const date = event.currentTarget.dataset.date;
        if (date) this.selectedDate = new Date(date);
    }

    openScheduleVisitModal() { this.showScheduleVisitModal = true; }
    closeScheduleVisitModal() { this.showScheduleVisitModal = false; }
    handleModalClick(event) { event.stopPropagation(); }

    handleVisitSuccess() {
        this.showScheduleVisitModal = false;
        this.dispatchEvent(new ShowToastEvent({ title: 'Success', message: 'Visit created successfully!', variant: 'success' }));
        this.loadDayVisits();
        this.loadCarouselDates();
    }

    handleVisitError(event) {
        console.error('Visit error:', event.detail);
        this.dispatchEvent(new ShowToastEvent({ title: 'Error', message: 'Failed to create visit.', variant: 'error' }));
    }
}
