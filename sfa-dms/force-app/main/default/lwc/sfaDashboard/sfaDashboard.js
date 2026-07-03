import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getDashboardData from '@salesforce/apex/DashboardController.getDashboardData';
import getDashboardAttendanceCompliance from '@salesforce/apex/AttendanceLWCController.getDashboardAttendanceCompliance';
import getPriorityAccounts from '@salesforce/apex/PriorityAccountController.getPriorityAccounts';
import getLast14DaysVisits from '@salesforce/apex/VisitDayVisitsController.getLast14DaysVisits';

export default class SfaDashboard extends LightningElement {

    @track mainMetrics = [
        { id: 'todayVisits', title: "Today's Visits", value: '0', icon: '📍', trend: 'No visits today', trendClass: 'trend-neutral', subtext: 'Schedule now', priority: 'low' },
        { id: 'monthVisits', title: 'This Month', value: '24', icon: '📅', trend: '+4 from last month', trendClass: 'trend-positive', subtext: 'On track', priority: 'medium' },
        { id: 'totalAccounts', title: 'Total Accounts', value: '156', icon: '🏢', trend: '+12 new', trendClass: 'trend-positive', subtext: 'Active', priority: 'high' },
        { id: 'activeDealers', title: 'Active Dealers', value: '42', icon: '🤝', trend: 'All active', trendClass: 'trend-positive', subtext: 'Engaged', priority: 'medium' },
        { id: 'pendingExpenses', title: 'Pending Expenses', value: '3', icon: '📋', trend: '₹4,500 total', trendClass: 'trend-warning', subtext: 'Submit now', priority: 'medium' },
        { id: 'awaitingApproval', title: 'Awaiting Approval', value: '2', icon: '⏳', trend: '2 requests', trendClass: 'trend-neutral', subtext: 'Check status', priority: 'low' }
    ];

    @track attendanceComplianceSummary = { compliancePercent: 0, presentDays: 0, totalDays: 0, onTimeDays: 0 };
    @track recentVisits = [];
    @track priorityAccounts = [];
    @track showScheduleVisitModal = false;
    @track currentDate = '';

    // dashboard data
    todayVisits = 0;
    monthVisits = 0;
    activeDealers = 0;
    totalAccounts = 0;
    awaitingApproval = 0;
    pendingExpenses = 0;

    connectedCallback() {
        this.updateDate();
        this.loadDashboardMetrics();
        this.loadDashboardAttendanceCompliance();
        this.loadPriorityAccounts();
        this.loadLast14DaysVisits();
    }

    updateDate() {
        this.currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }

    loadDashboardMetrics() {
        getDashboardData()
            .then(data => {
                if (!data) return;
                if (data.todayVisits !== undefined) this.todayVisits = data.todayVisits;
                if (data.monthlyVisits !== undefined) this.monthVisits = data.monthlyVisits;
                if (data.pendingExpenses !== undefined) this.pendingExpenses = data.pendingExpenses;
                if (data.awaitingApproval !== undefined) this.awaitingApproval = data.awaitingApproval;
                if (data.activeDealers !== undefined) this.activeDealers = data.activeDealers;
                if (data.totalAccounts !== undefined) this.totalAccounts = data.totalAccounts;
                this.updateDashboardMetrics();
            })
            .catch(error => console.error('Dashboard metrics error', error));
    }

    updateDashboardMetrics() {
        this.mainMetrics = this.mainMetrics.map(metric => {
            if (metric.id === 'todayVisits') {
                const v = this.todayVisits;
                return { ...metric, value: v, trend: v === 0 ? 'No visits today' : `${v} visits scheduled`, trendClass: v === 0 ? 'trend-neutral' : 'trend-positive', subtext: v === 0 ? 'Schedule now' : 'View schedule' };
            }
            if (metric.id === 'monthVisits') return { ...metric, value: this.monthVisits };
            if (metric.id === 'pendingExpenses') {
                const p = this.pendingExpenses;
                return { ...metric, value: p, trend: p === 0 ? 'No pending expenses' : `${p} expense${p === 1 ? '' : 's'} pending`, trendClass: p > 0 ? 'trend-warning' : 'trend-positive', subtext: p > 0 ? 'Submit now' : 'All clear' };
            }
            if (metric.id === 'awaitingApproval') {
                const a = this.awaitingApproval;
                return { ...metric, value: a, trend: a === 0 ? 'No pending approvals' : `${a} request${a === 1 ? '' : 's'} pending`, trendClass: a > 0 ? 'trend-warning' : 'trend-positive', subtext: a > 0 ? 'Check status' : 'All clear' };
            }
            if (metric.id === 'activeDealers') {
                const a = this.activeDealers;
                return { ...metric, value: a, trend: a === 0 ? 'No active dealers' : `${a} dealer${a === 1 ? '' : 's'} active`, trendClass: a === 0 ? 'trend-warning' : 'trend-positive' };
            }
            if (metric.id === 'totalAccounts') return { ...metric, value: this.totalAccounts };
            return metric;
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
            .catch(error => console.error('Compliance error', error));
    }

    loadPriorityAccounts() {
        getPriorityAccounts({ limitSize: 5 })
            .then(result => {
                this.priorityAccounts = (result || []).map(acc => ({
                    id: acc.id,
                    name: acc.name,
                    priority: acc.priority || 'Low',
                    priorityClass: this.getPriorityClass(acc.priority)
                }));
            })
            .catch(err => { console.error('Priority accounts error', err); this.priorityAccounts = []; });
    }

    loadLast14DaysVisits() {
        getLast14DaysVisits()
            .then(result => {
                const mapped = (result || []).map(v => {
                    const d = v.visitDate ? new Date(v.visitDate) : null;
                    return {
                        id: v.id,
                        account: v.account,
                        accountInitial: (v.account || 'A').charAt(0).toUpperCase(),
                        status: v.status,
                        statusClass: this.getStatusClass(v.status),
                        dateDisplay: d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'
                    };
                });
                this.recentVisits = mapped.slice(0, 3);
            })
            .catch(error => { console.error('Recent visits error', error); this.recentVisits = []; });
    }

    get complianceBarWidth() {
        return `width: ${this.attendanceComplianceSummary.compliancePercent}%`;
    }

    getPriorityClass(priority) {
        const p = (priority || '').toLowerCase();
        if (p === 'high') return 'priority-bar high';
        if (p === 'medium') return 'priority-bar medium';
        return 'priority-bar low';
    }

    getStatusClass(status) {
        const map = { 'Completed': 'status-completed', 'In Progress': 'status-inprogress', 'Scheduled': 'status-scheduled', 'Planned': 'status-scheduled', 'Pending': 'status-pending' };
        return map[status] || 'status-pending';
    }

    openScheduleVisitModal() {
        this.showScheduleVisitModal = true;
    }

    closeScheduleVisitModal() {
        this.showScheduleVisitModal = false;
    }

    stopProp(event) { event.stopPropagation(); }

    handleVisitSuccess() {
        this.showScheduleVisitModal = false;
        this.dispatchEvent(new ShowToastEvent({ title: 'Success', message: 'Visit scheduled successfully!', variant: 'success' }));
        this.loadLast14DaysVisits();
        this.loadDashboardMetrics();
    }

    handleVisitError(event) {
        console.error(event.detail);
    }

    handleGoToAttendance() {
        this.dispatchEvent(new CustomEvent('navigate', { detail: { tab: 'attendance' }, bubbles: true, composed: true }));
    }

    handleGoToVisits() {
        this.dispatchEvent(new CustomEvent('navigate', { detail: { tab: 'visit-execution' }, bubbles: true, composed: true }));
    }

    handleViewAllVisits() {
        this.dispatchEvent(new CustomEvent('navigate', { detail: { tab: 'visit-execution' }, bubbles: true, composed: true }));
    }
}
