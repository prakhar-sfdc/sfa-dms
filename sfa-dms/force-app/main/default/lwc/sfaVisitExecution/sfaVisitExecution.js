import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getDayVisits from '@salesforce/apex/VisitDayVisitsController.getDayVisits';
import getLast14DaysVisits from '@salesforce/apex/VisitDayVisitsController.getLast14DaysVisits';
import checkInVisit from '@salesforce/apex/VisitDayVisitsController.checkInVisit';
import createVisit from '@salesforce/apex/VisitDayVisitsController.createVisit';

export default class SfaVisitExecution extends LightningElement {

    // ── Detail View Ownership ────────────────────────────
    @track activeVisitId = null;
    @track activeVisitCheckInTime = null;
    @track activeVisitLat = null;
    @track activeVisitLng = null;
    @track activeVisitAddress = null;

    // ── List View State ──────────────────────────────────
    @track selectedDate = new Date();
    @track dailyVisits = [];
    @track recentVisits = [];
    @track allVisits = [];
    @track carouselDates = [];
    @track showVisitHistoryModal = false;
    @track checkingInVisitId = null;

    connectedCallback() {
        this.loadCarouselDates();
        this.loadDayVisits();
        this.loadRecentVisits();
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
        getDayVisits({ visitDate: this.formatDateForApex(this.selectedDate) })
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
                    isCompleted: v.Visit_Status__c === 'Completed',
                    isCheckingIn: false,
                    checkInLat: v.Check_In_Latitude__c,
                    checkInLng: v.Check_In_Longitude__c,
                    checkInTime: v.Check_In_Time__c,
                    checkInAddress: v.Check_In_Address__c
                }));
            })
            .catch(error => console.error('Day visits error', error));
    }

    get dailyVisitsWithMeta() { return this.dailyVisits; }

    loadRecentVisits() {
        getLast14DaysVisits()
            .then(result => {
                this.recentVisits = (result || []).slice(0, 5).map(v => ({
                    id: v.Id,
                    account: v.Account__r?.Name || '—',
                    time: this.fmtTime(v.Check_In_Time__c) || this.fmtTime(v.Planned_Start_Time__c),
                    status: v.Visit_Status__c,
                    statusClass: this.getStatusClass(v.Visit_Status__c)
                }));
                this.allVisits = result || [];
            })
            .catch(error => console.error('Recent visits error', error));
    }

    getStatusClass(status) {
        const map = {
            'Planned': 'status planned',
            'In Progress': 'status in-progress',
            'Completed': 'status completed'
        };
        return map[status] || 'status';
    }

    fmtTime(timeStr) {
        if (!timeStr) return '—';
        try { return new Date(`2000-01-01T${timeStr}`).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); }
        catch { return timeStr; }
    }

    formatDateForApex(date) {
        if (!date) return null;
        const d = new Date(date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    get selectedDateDisplay() {
        return this.selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }

    prevDate() {
        this.selectedDate.setDate(this.selectedDate.getDate() - 1);
        this.loadCarouselDates();
        this.loadDayVisits();
    }

    nextDate() {
        this.selectedDate.setDate(this.selectedDate.getDate() + 1);
        this.loadCarouselDates();
        this.loadDayVisits();
    }

    handleExecutionDateClick(event) {
        const dateOffset = parseInt(event.currentTarget.dataset.date);
        const d = new Date(this.selectedDate);
        d.setDate(d.getDate() + dateOffset);
        this.selectedDate = d;
        this.loadDayVisits();
        this.loadCarouselDates();
    }

    async handleVisitCheckIn(event) {
        const visitId = event.currentTarget.dataset.id;
        const account = event.currentTarget.dataset.account;
        this.checkingInVisitId = visitId;

        const visit = this.dailyVisits.find(v => v.id === visitId);
        if (visit) visit.isCheckingIn = true;

        try {
            const result = await checkInVisit({ visitId });
            if (result) {
                this.activeVisitId = visitId;
                this.activeVisitCheckInTime = new Date().toLocaleTimeString();
                this.activeVisitLat = result.latitude;
                this.activeVisitLng = result.longitude;
                this.activeVisitAddress = result.address;
                this.dispatchEvent(new ShowToastEvent({ title: 'Success', message: 'Visit checked in', variant: 'success' }));
            }
        } catch (error) {
            console.error('Check-in error:', error);
            this.dispatchEvent(new ShowToastEvent({ title: 'Error', message: 'Failed to check in visit', variant: 'error' }));
        } finally {
            this.checkingInVisitId = null;
            if (visit) visit.isCheckingIn = false;
        }
    }

    handleResumeVisit(event) {
        const visitId = event.currentTarget.dataset.id;
        const visit = this.dailyVisits.find(v => v.id === visitId);
        if (visit && visit.isInProgress) {
            this.activeVisitId = visitId;
            this.activeVisitCheckInTime = visit.checkInTime;
            this.activeVisitLat = visit.checkInLat;
            this.activeVisitLng = visit.checkInLng;
            this.activeVisitAddress = visit.checkInAddress;
        }
    }

    handleVisitDetailBack() {
        this.activeVisitId = null;
        this.activeVisitCheckInTime = null;
        this.activeVisitLat = null;
        this.activeVisitLng = null;
        this.activeVisitAddress = null;
        this.loadDayVisits();
        this.loadRecentVisits();
    }

    handleVisitCheckOutEvent() {
        this.handleVisitDetailBack();
        this.dispatchEvent(new ShowToastEvent({ title: 'Success', message: 'Visit checked out', variant: 'success' }));
    }

    openCreateVisitFromExecution() {
        this.dispatchEvent(new ShowToastEvent({ title: 'Feature', message: 'Create visit form would open here', variant: 'info' }));
    }

    handleViewAllVisits() {
        this.showVisitHistoryModal = true;
    }

    handleModalClick(event) {
        event.stopPropagation();
    }
}
