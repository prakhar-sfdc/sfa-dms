import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getDayPlan from '@salesforce/apex/JourneyPlanController.getDayPlan';
import getWeekPlan from '@salesforce/apex/JourneyPlanController.getWeekPlan';
import getMonthPlan from '@salesforce/apex/JourneyPlanController.getMonthPlan';
import getVisitCountsForRange from '@salesforce/apex/JourneyPlanController.getVisitCountsForRange';
import searchAccounts from '@salesforce/apex/JourneyPlanController.searchAccounts';
import addVisit from '@salesforce/apex/JourneyPlanController.addVisit';
import reorderVisits from '@salesforce/apex/JourneyPlanController.reorderVisits';
import deleteVisit from '@salesforce/apex/JourneyPlanController.deleteVisit';
import uploadPlanCsv from '@salesforce/apex/JourneyPlanController.uploadPlanCsv';

const PURPOSES = ['Quarterly Review','Product Demo','Contract Renewal','Order Delivery','Stock Check',
    'Follow-up Visit','New Account Meeting','Complaint Resolution','Payment Collection','Relationship Building'];
const PRIORITIES = ['High','Medium','Low'];
const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default class SfaJourneyPlan extends LightningElement {
    @track selectedView = 'day';
    @track selectedDate = new Date();

    // Day
    @track plan = {};
    @track dayItems = [];
    @track isLoading = false;

    // Week
    @track weekDays = [];
    @track weekRange = '';

    // Month
    @track monthCells = [];
    @track calLabel = '';

    // Calendar popup
    @track showCalendar = false;
    @track calMonth = new Date().getMonth();
    @track calYear = new Date().getFullYear();
    @track calendarDays = [];

    // Upload modal
    @track showUpload = false;
    @track uploadResult;
    @track isUploading = false;

    // Add-visit modal
    @track showAddVisit = false;
    @track accountResults = [];
    @track selectedAccount;
    @track addTime = '09:30';
    @track addPurpose = 'Product Demo';
    @track addPriority = 'Medium';
    @track isSaving = false;

    searchTimer;
    weekdayLabels = WEEKDAYS;
    purposeOptions = PURPOSES.map(p => ({ label: p, value: p }));
    priorityOptions = PRIORITIES.map(p => ({ label: p, value: p }));

    connectedCallback() {
        this.loadDay();
    }

    // ── View state ────────────────────────────────────────────
    get isDayView() { return this.selectedView === 'day'; }
    get isWeekView() { return this.selectedView === 'week'; }
    get isMonthView() { return this.selectedView === 'month'; }
    get dayBtnClass() { return this.tabClass('day'); }
    get weekBtnClass() { return this.tabClass('week'); }
    get monthBtnClass() { return this.tabClass('month'); }
    tabClass(v) { return this.selectedView === v ? 'view-btn active' : 'view-btn'; }

    changeView(event) {
        this.selectedView = event.currentTarget.dataset.view;
        if (this.isDayView) this.loadDay();
        else if (this.isWeekView) this.loadWeek();
        else this.loadMonth();
    }

    // ── ISO helpers ───────────────────────────────────────────
    toISO(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
    get selectedISO() { return this.toISO(this.selectedDate); }
    get selectedDateDisplay() {
        return this.selectedDate.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    }

    // ── DAY ───────────────────────────────────────────────────
    loadDay() {
        this.isLoading = true;
        getDayPlan({ planDate: this.selectedISO })
            .then(res => {
                this.plan = res || {};
                this.dayItems = (res && res.items ? res.items : []).map((it, idx) => this.decorateItem(it, idx));
            })
            .catch(err => this.toastError('Load day', err))
            .finally(() => { this.isLoading = false; });
    }

    decorateItem(it, idx) {
        const isCompleted = it.status === 'Completed';
        const isInProgress = it.status === 'In Progress';
        return {
            ...it,
            seq: idx + 1,
            priorityClass: `pill priority-${(it.priority || 'Medium').toLowerCase()}`,
            statusClass: `pill status-${this.slug(it.status)}`,
            isCompleted,
            isInProgress,
            distanceDisplay: (it.distanceFromPrev !== null && it.distanceFromPrev !== undefined)
                ? `${it.distanceFromPrev} km` : '—',
            durationDisplay: it.actualDuration ? this.fmtMins(it.actualDuration) : '—',
            travelDisplay: it.travelFromPrev ? this.fmtMins(it.travelFromPrev) : '—',
            showRoute: isCompleted
        };
    }

    // metric getters (day)
    get plannedCount() { return this.plan.plannedVisits || 0; }
    get completedCount() { return this.plan.completedVisits || 0; }
    get pendingCount() { return this.plan.pendingVisits || 0; }
    get successRate() { return this.plan.successRate != null ? Math.round(this.plan.successRate) : 0; }
    get totalDistanceDisplay() { return `${(this.plan.totalDistance || 0).toFixed(1)} km`; }
    get travelTimeDisplay() { return this.fmtMins(this.plan.totalTravelTime || 0); }
    get onSiteDisplay() { return this.fmtMins(this.plan.actualDuration || 0); }
    get progressWidth() {
        const p = this.plannedCount ? Math.round((this.completedCount / this.plannedCount) * 100) : 0;
        return `width:${p}%`;
    }
    get hasItems() { return this.dayItems.length > 0; }

    prevDate() { this.shiftDate(-1); }
    nextDate() { this.shiftDate(1); }
    shiftDate(days) {
        const d = new Date(this.selectedDate);
        d.setDate(d.getDate() + days);
        this.selectedDate = d;
        this.loadDay();
    }

    // ── WEEK ──────────────────────────────────────────────────
    loadWeek() {
        const start = this.startOfWeek(this.selectedDate);
        getWeekPlan({ weekStart: this.toISO(start) })
            .then(res => {
                this.weekDays = (res || []).map(w => ({
                    ...w,
                    dateLabel: this.dayNumFromISO(w.dateStr),
                    distanceDisplay: `${(w.distance || 0).toFixed(1)} km`,
                    cardClass: w.isToday ? 'week-card today' : 'week-card'
                }));
                const end = new Date(start); end.setDate(end.getDate() + 6);
                this.weekRange = `${start.toLocaleDateString('en-IN',{month:'short',day:'numeric'})} – ${end.toLocaleDateString('en-IN',{month:'short',day:'numeric'})}`;
            })
            .catch(err => this.toastError('Load week', err));
    }
    get weekPlannedTotal() { return this.weekDays.reduce((s, w) => s + (w.planned || 0), 0); }
    get weekCompletedTotal() { return this.weekDays.reduce((s, w) => s + (w.completed || 0), 0); }
    get weekDistanceTotal() { return `${this.weekDays.reduce((s, w) => s + (w.distance || 0), 0).toFixed(1)} km`; }

    prevWeek() { this.shiftDate(-7); this.loadWeek(); }
    nextWeek() { this.shiftDate(7); this.loadWeek(); }

    selectWeekDay(event) {
        this.selectedDate = new Date(event.currentTarget.dataset.date + 'T00:00:00');
        this.selectedView = 'day';
        this.loadDay();
    }

    // ── MONTH ─────────────────────────────────────────────────
    loadMonth() {
        const y = this.selectedDate.getFullYear();
        const m = this.selectedDate.getMonth();
        this.calLabel = `${MONTHS[m]} ${y}`;
        const todayISO = this.toISO(new Date());
        getMonthPlan({ year: y, month: m + 1 })
            .then(res => {
                const firstDow = new Date(y, m, 1).getDay();
                const cells = [];
                for (let i = 0; i < firstDow; i++) cells.push({ key: `b${i}`, blank: true });
                (res || []).forEach(d => {
                    const iso = d.dateStr;
                    cells.push({
                        key: iso,
                        iso,
                        dayNum: d.dayNum,
                        planned: d.planned,
                        completed: d.completed,
                        hasVisits: d.planned > 0,
                        events: (d.events || []).map((t, i) => ({ key: `${iso}-e${i}`, text: t })),
                        isToday: iso === todayISO,
                        cellClass: iso === todayISO ? 'month-day today' : 'month-day'
                    });
                });
                this.monthCells = cells;
            })
            .catch(err => this.toastError('Load month', err));
    }
    get monthPlannedTotal() { return this.monthCells.reduce((s, c) => s + (c.planned || 0), 0); }
    get monthActiveDays() { return this.monthCells.filter(c => c.hasVisits).length; }

    prevMonth() { this.shiftMonth(-1); }
    nextMonth() { this.shiftMonth(1); }
    shiftMonth(delta) {
        const d = new Date(this.selectedDate);
        d.setMonth(d.getMonth() + delta);
        this.selectedDate = d;
        this.loadMonth();
    }
    selectMonthDay(event) {
        const iso = event.currentTarget.dataset.date;
        if (!iso) return;
        this.selectedDate = new Date(iso + 'T00:00:00');
        this.selectedView = 'day';
        this.loadDay();
    }

    // ── Calendar popup (date picker) ──────────────────────────
    toggleCalendar() {
        this.showCalendar = !this.showCalendar;
        if (this.showCalendar) {
            this.calMonth = this.selectedDate.getMonth();
            this.calYear = this.selectedDate.getFullYear();
            this.buildCalendar();
        }
    }
    get calPopupLabel() { return `${MONTHS[this.calMonth]} ${this.calYear}`; }
    calPrevMonth() { if (--this.calMonth < 0) { this.calMonth = 11; this.calYear--; } this.buildCalendar(); }
    calNextMonth() { if (++this.calMonth > 11) { this.calMonth = 0; this.calYear++; } this.buildCalendar(); }

    buildCalendar() {
        const y = this.calYear, m = this.calMonth;
        const first = new Date(y, m, 1);
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const startISO = this.toISO(new Date(y, m, 1));
        const endISO = this.toISO(new Date(y, m, daysInMonth));
        const selISO = this.selectedISO;
        getVisitCountsForRange({ startDate: startISO, endDate: endISO })
            .then(counts => {
                const cells = [];
                for (let i = 0; i < first.getDay(); i++) cells.push({ key: `cb${i}`, blank: true });
                for (let d = 1; d <= daysInMonth; d++) {
                    const iso = this.toISO(new Date(y, m, d));
                    const c = counts[iso] || 0;
                    cells.push({
                        key: iso, iso, dayNum: d, count: c, hasVisits: c > 0,
                        cls: iso === selISO ? 'cal-day selected' : 'cal-day'
                    });
                }
                this.calendarDays = cells;
            })
            .catch(err => this.toastError('Calendar', err));
    }
    selectCalDay(event) {
        const iso = event.currentTarget.dataset.date;
        if (!iso) return;
        this.selectedDate = new Date(iso + 'T00:00:00');
        this.showCalendar = false;
        if (this.isDayView) this.loadDay();
        else if (this.isWeekView) this.loadWeek();
        else this.loadMonth();
    }

    // ── Reorder / delete ──────────────────────────────────────
    moveUp(event) { this.move(event.currentTarget.dataset.id, -1); }
    moveDown(event) { this.move(event.currentTarget.dataset.id, 1); }
    move(id, delta) {
        const idx = this.dayItems.findIndex(i => i.id === id);
        const target = idx + delta;
        if (idx < 0 || target < 0 || target >= this.dayItems.length) return;
        const ids = this.dayItems.map(i => i.id);
        const [moved] = ids.splice(idx, 1);
        ids.splice(target, 0, moved);
        reorderVisits({ orderedItemIds: ids })
            .then(() => this.loadDay())
            .catch(err => this.toastError('Reorder', err));
    }
    removeVisit(event) {
        deleteVisit({ itemId: event.currentTarget.dataset.id })
            .then(() => { this.toast('Removed', 'Visit removed from plan', 'success'); this.loadDay(); })
            .catch(err => this.toastError('Delete', err));
    }

    // ── Upload PJP ────────────────────────────────────────────
    openUpload() { this.showUpload = true; this.uploadResult = undefined; }
    closeUpload() { this.showUpload = false; }
    handleFile(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        this.isUploading = true;
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            uploadPlanCsv({ base64Content: base64 })
                .then(res => {
                    this.uploadResult = res;
                    this.toast('Upload complete', `${res.itemsCreated} visits imported, ${res.rowsSkipped} skipped`, 'success');
                    if (this.isDayView) this.loadDay();
                })
                .catch(err => this.toastError('Upload', err))
                .finally(() => { this.isUploading = false; });
        };
        reader.onerror = () => { this.isUploading = false; this.toast('Upload', 'Could not read file', 'error'); };
        reader.readAsDataURL(file);
    }
    get uploadErrors() {
        const errs = this.uploadResult && this.uploadResult.errors ? this.uploadResult.errors : [];
        return errs.map((e, i) => ({ key: `err${i}`, text: e }));
    }
    get hasUploadErrors() { return this.uploadErrors.length > 0; }

    // ── Add visit (builder) ───────────────────────────────────
    openAddVisit() {
        this.showAddVisit = true;
        this.selectedAccount = undefined;
        this.accountResults = [];
        this.addTime = '09:30';
        this.addPurpose = 'Product Demo';
        this.addPriority = 'Medium';
    }
    closeAddVisit() { this.showAddVisit = false; }

    handleAccountSearch(event) {
        const key = event.target.value;
        window.clearTimeout(this.searchTimer);
        this.searchTimer = window.setTimeout(() => {
            if (!key || key.length < 2) { this.accountResults = []; return; }
            searchAccounts({ searchKey: key })
                .then(res => { this.accountResults = res || []; })
                .catch(err => this.toastError('Search', err));
        }, 300);
    }
    selectAccount(event) {
        const id = event.currentTarget.dataset.id;
        this.selectedAccount = this.accountResults.find(a => a.id === id);
        this.accountResults = [];
    }
    clearAccount() { this.selectedAccount = undefined; }
    get hasAccountResults() { return this.accountResults.length > 0; }

    handleTime(event) { this.addTime = event.target.value; }
    handlePurpose(event) { this.addPurpose = event.detail.value; }
    handlePriority(event) { this.addPriority = event.detail.value; }

    submitAddVisit() {
        if (!this.selectedAccount) { this.toast('Add visit', 'Select an account first', 'warning'); return; }
        this.isSaving = true;
        addVisit({
            accountId: this.selectedAccount.id,
            planDate: this.selectedISO,
            plannedTime: this.addTime,
            purpose: this.addPurpose,
            priority: this.addPriority
        })
            .then(() => {
                this.toast('Visit added', `${this.selectedAccount.name} added to plan`, 'success');
                this.showAddVisit = false;
                this.loadDay();
            })
            .catch(err => this.toastError('Add visit', err))
            .finally(() => { this.isSaving = false; });
    }

    stopProp(event) { event.stopPropagation(); }

    // ── Utils ─────────────────────────────────────────────────
    fmtMins(mins) {
        if (!mins) return '0m';
        const h = Math.floor(mins / 60), m = mins % 60;
        if (h && m) return `${h}h ${m}m`;
        if (h) return `${h}h`;
        return `${m}m`;
    }
    slug(s) { return (s || '').toLowerCase().replace(/\s+/g, '-'); }
    dayNumFromISO(iso) {
        const d = new Date(iso + 'T00:00:00');
        return d.getDate();
    }
    startOfWeek(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }
    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
    toastError(ctx, err) {
        const msg = (err && err.body && err.body.message) || (err && err.message) || 'Unexpected error';
        this.dispatchEvent(new ShowToastEvent({ title: ctx, message: msg, variant: 'error' }));
    }
}
