import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getDayPlan from '@salesforce/apex/JourneyPlanController.getDayPlan';
import checkInItem from '@salesforce/apex/JourneyPlanController.checkInItem';
import checkOutItem from '@salesforce/apex/JourneyPlanController.checkOutItem';
import getItemDetail from '@salesforce/apex/JourneyPlanController.getItemDetail';
import getItemAnalyses from '@salesforce/apex/JourneyPlanController.getItemAnalyses';
import saveMarketAnalysis from '@salesforce/apex/JourneyPlanController.saveMarketAnalysis';
import updateVisitNotes from '@salesforce/apex/JourneyPlanController.updateVisitNotes';
import getVisitAccountFields from '@salesforce/apex/JourneyPlanController.getVisitAccountFields';

const OUTCOMES = ['Successful','Partially Successful','Postponed','Cancelled','No Show'];
const VISIBILITY = ['Excellent','Good','Average','Poor','Not Displayed'];
const PROMO = ['No / Yes - Ours','Yes - Competitor','Yes - Both'];
const DEALER_PREF = ['Strongly','Slightly Prefer Ours','Neutral','Slightly','Strongly Prefer Competitor'];
const DEMAND = ['Increasing','Stable','Decreasing - Ours','Increasing - Competitor'];
const SENSITIVITY = ['High','Medium','Low'];

export default class SfaVisitExecution extends LightningElement {
    @track selectedDate = new Date();
    @track plan = {};
    @track items = [];
    @track isLoading = false;

    // GPS
    @track gpsStatus = '';
    busyItemId = null;

    // Detail modal
    @track showDetail = false;
    @track detail;
    @track detailTab = 'info';
    @track analyses = [];
    @track editingNotes = false;
    @track notesDraft = '';
    @track accountFields = [];

    // Analysis form
    @track showAnalysisForm = false;
    @track af = {};
    @track isSavingAnalysis = false;

    // Checkout modal
    @track showCheckout = false;
    @track checkoutItemId;
    @track checkoutAccount = '';
    @track outcome = 'Successful';
    @track notes = '';
    @track isCheckingOut = false;

    outcomeOptions = OUTCOMES.map(o => ({ label: o, value: o }));
    visibilityOptions = VISIBILITY.map(o => ({ label: o, value: o }));
    promoOptions = PROMO.map(o => ({ label: o, value: o }));
    dealerPrefOptions = DEALER_PREF.map(o => ({ label: o, value: o }));
    demandOptions = DEMAND.map(o => ({ label: o, value: o }));
    sensitivityOptions = SENSITIVITY.map(o => ({ label: o, value: o }));

    connectedCallback() {
        this.loadDay();
        this.loadAccountFields();
    }

    // Admin-configurable Account fields (Account "Visit_Account_Display" field set)
    loadAccountFields() {
        getVisitAccountFields()
            .then(res => { this.accountFields = (res || []).map((name, i) => ({ key: `af${i}`, name })); })
            .catch(err => this.toastError('Account fields', err));
    }
    get hasAccountFields() {
        return this.detail && this.detail.accountId && this.accountFields.length > 0;
    }

    // ── Date ──────────────────────────────────────────────────
    toISO(d) {
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    get selectedISO() { return this.toISO(this.selectedDate); }
    get dateDisplay() {
        return this.selectedDate.toLocaleDateString('en-IN', { weekday: 'long', month: 'short', day: 'numeric' });
    }
    prevDate() { this.shift(-1); }
    nextDate() { this.shift(1); }
    shift(n) { const d = new Date(this.selectedDate); d.setDate(d.getDate()+n); this.selectedDate = d; this.loadDay(); }

    // ── Load ──────────────────────────────────────────────────
    loadDay() {
        this.isLoading = true;
        getDayPlan({ planDate: this.selectedISO })
            .then(res => {
                this.plan = res || {};
                this.items = (res && res.items ? res.items : []).map((it, idx) => this.decorate(it, idx));
            })
            .catch(err => this.toastError('Load', err))
            .finally(() => { this.isLoading = false; });
    }

    decorate(it, idx) {
        const isCompleted = it.status === 'Completed';
        const isInProgress = it.status === 'In Progress';
        const canCheckIn = it.status === 'Scheduled';
        return {
            ...it,
            seq: idx + 1,
            statusClass: `pill status-${(it.status||'').toLowerCase().replace(/\s+/g,'-')}`,
            canCheckIn,
            isInProgress,
            isCompleted,
            busy: this.busyItemId === it.id,
            distanceDisplay: (it.distanceFromPrev !== null && it.distanceFromPrev !== undefined) ? `${it.distanceFromPrev} km` : '—',
            travelDisplay: it.travelFromPrev ? this.fmtMins(it.travelFromPrev) : '—',
            durationDisplay: it.actualDuration ? this.fmtMins(it.actualDuration) : '—'
        };
    }

    // ── Route metrics ─────────────────────────────────────────
    get plannedCount() { return this.plan.plannedVisits || 0; }
    get completedCount() { return this.plan.completedVisits || 0; }
    get pendingCount() { return this.plan.pendingVisits || 0; }
    get totalDistanceDisplay() { return `${(this.plan.totalDistance || 0).toFixed(1)} km`; }
    get travelTimeDisplay() { return this.fmtMins(this.plan.totalTravelTime || 0); }
    get onSiteDisplay() { return this.fmtMins(this.plan.actualDuration || 0); }
    get hasItems() { return this.items.length > 0; }

    // ── GPS ───────────────────────────────────────────────────
    getGPS() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return; }
            this.gpsStatus = 'Locating…';
            navigator.geolocation.getCurrentPosition(
                pos => {
                    this.gpsStatus = '';
                    resolve({
                        lat: Number(pos.coords.latitude.toFixed(6)),
                        lng: Number(pos.coords.longitude.toFixed(6)),
                        address: ''
                    });
                },
                err => { this.gpsStatus = ''; reject(new Error(this.gpsErr(err))); },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        });
    }
    gpsErr(err) {
        const m = { 1: 'Location permission denied', 2: 'Position unavailable', 3: 'Location request timed out' };
        return m[err.code] || 'Unable to get location';
    }

    // ── Check-in ──────────────────────────────────────────────
    handleCheckIn(event) {
        const id = event.currentTarget.dataset.id;
        this.busyItemId = id;
        this.refreshBusy();
        this.getGPS()
            .then(gps => checkInItem({ itemId: id, lat: gps.lat, lng: gps.lng, address: gps.address }))
            .then(() => { this.toast('Checked in', 'Location captured', 'success'); this.loadDay(); })
            .catch(err => this.toastError('Check-in', err))
            .finally(() => { this.busyItemId = null; });
    }

    // ── Check-out (with outcome) ──────────────────────────────
    openCheckout(event) {
        this.checkoutItemId = event.currentTarget.dataset.id;
        this.checkoutAccount = event.currentTarget.dataset.account || '';
        this.outcome = 'Successful';
        this.notes = '';
        this.showCheckout = true;
    }
    closeCheckout() { this.showCheckout = false; }
    handleOutcome(e) { this.outcome = e.detail.value; }
    handleNotes(e) { this.notes = e.target.value; }

    confirmCheckout() {
        this.isCheckingOut = true;
        this.getGPS()
            .then(gps => checkOutItem({
                itemId: this.checkoutItemId, lat: gps.lat, lng: gps.lng,
                address: gps.address, outcome: this.outcome, notes: this.notes
            }))
            .then(res => {
                this.showCheckout = false;
                const dur = res && res.actualDuration ? this.fmtMins(res.actualDuration) : '';
                this.toast('Checked out', dur ? `On-site time: ${dur}` : 'Visit completed', 'success');
                this.loadDay();
            })
            .catch(err => this.toastError('Check-out', err))
            .finally(() => { this.isCheckingOut = false; });
    }

    // ── Detail ────────────────────────────────────────────────
    openDetail(event) {
        const id = event.currentTarget.dataset.id;
        this.detailTab = 'info';
        this.showAnalysisForm = false;
        this.editingNotes = false;
        getItemDetail({ itemId: id })
            .then(res => {
                this.detail = this.decorateDetail(res);
                this.showDetail = true;
                return this.loadAnalyses(id);
            })
            .catch(err => this.toastError('Detail', err));
    }
    decorateDetail(res) {
        const checkedIn = !!res.checkInTime;
        const completed = res.status === 'Completed';
        const inProgress = res.status === 'In Progress';
        return {
            ...res,
            accountInitial: (res.accountName || '?').trim().charAt(0).toUpperCase(),
            statusPill: `pill status-${(res.status||'').toLowerCase().replace(/\s+/g,'-')}`,
            checkInCoords: (res.checkInLat != null && res.checkInLng != null) ? `${res.checkInLat}, ${res.checkInLng}` : '—',
            checkOutCoords: (res.checkOutLat != null && res.checkOutLng != null) ? `${res.checkOutLat}, ${res.checkOutLng}` : '—',
            checkInTimeDisplay: res.checkInTime || 'Not checked in',
            checkOutTimeDisplay: res.checkOutTime || (inProgress ? 'On site' : 'Not checked out'),
            checkInAddressDisplay: res.checkInAddress || '—',
            checkOutAddressDisplay: res.checkOutAddress || '—',
            plannedTimeDisplay: res.plannedTime || '—',
            purposeDisplay: res.purpose || '—',
            priorityDisplay: res.priority || 'Medium',
            priorityPill: `pill priority-${(res.priority || 'Medium').toLowerCase()}`,
            outcomeDisplay: res.outcome || '—',
            locationDisplay: res.location || '—',
            distanceDisplay: (res.distanceFromPrev != null) ? `${res.distanceFromPrev} km` : '—',
            travelDisplay: res.travelFromPrev ? this.fmtMins(res.travelFromPrev) : '—',
            durationDisplay: res.actualDuration ? this.fmtMins(res.actualDuration) : (inProgress ? 'In progress' : '—'),
            notesDisplay: res.notes || '',
            // timeline node states
            checkedIn, completed, inProgress,
            ciDotClass: checkedIn ? 'tl-dot done' : 'tl-dot',
            onsiteDotClass: completed ? 'tl-dot done' : (checkedIn ? 'tl-dot active' : 'tl-dot'),
            coDotClass: completed ? 'tl-dot done' : 'tl-dot pending',
            hasOutcome: !!res.outcome
        };
    }
    loadAnalyses(itemId) {
        return getItemAnalyses({ itemId })
            .then(res => { this.analyses = (res || []).map(a => this.decorateAnalysis(a)); })
            .catch(err => this.toastError('Analyses', err));
    }
    decorateAnalysis(a) {
        return {
            ...a,
            competitorPriceD: a.competitorPrice != null ? `₹${a.competitorPrice}` : '—',
            ourPriceD: a.ourPrice != null ? `₹${a.ourPrice}` : '—',
            priceDiffD: a.priceDifference != null ? `₹${a.priceDifference}` : '—',
            shelfShareD: a.shelfShare != null ? `${a.shelfShare}%` : '—',
            ourStockD: a.ourStock == null ? '—' : `${a.ourStock}`,
            compStockD: a.competitorStock == null ? '—' : `${a.competitorStock}`,
            productLine: `${a.ourProduct || 'Ours'} vs ${a.competitorProduct || a.competitorName}`
        };
    }
    closeDetail() { this.showDetail = false; this.editingNotes = false; }
    stopProp(e) { e.stopPropagation(); }

    // ── Notes (editable in the detail modal) ──────────────────
    startEditNotes() {
        this.notesDraft = (this.detail && this.detail.notes) || '';
        this.editingNotes = true;
    }
    handleDetailNotesChange(e) { this.notesDraft = e.detail ? e.detail.value : e.target.value; }
    cancelEditNotes() { this.editingNotes = false; }
    saveDetailNotes() {
        const id = this.detail.id;
        const notes = this.notesDraft;
        updateVisitNotes({ itemId: id, notes })
            .then(() => {
                this.detail = { ...this.detail, notes, notesDisplay: notes };
                this.editingNotes = false;
                this.toast('Saved', 'Visit notes updated', 'success');
            })
            .catch(err => this.toastError('Save notes', err));
    }

    // ── Contextual check-out from the detail modal ────────────
    get canCheckOutFromDetail() { return this.detail && this.detail.status === 'In Progress'; }
    checkOutFromDetail() {
        this.checkoutItemId = this.detail.id;
        this.checkoutAccount = this.detail.accountName || '';
        this.outcome = 'Successful';
        this.notes = '';
        this.showDetail = false;
        this.showCheckout = true;
    }

    // Tabs
    get isInfoTab() { return this.detailTab === 'info'; }
    get isAnalysisTab() { return this.detailTab === 'analysis'; }
    get infoTabClass() { return this.detailTab === 'info' ? 'tab active' : 'tab'; }
    get analysisTabClass() { return this.detailTab === 'analysis' ? 'tab active' : 'tab'; }
    showInfo() { this.detailTab = 'info'; }
    showAnalysis() { this.detailTab = 'analysis'; }
    get analysisCount() { return this.analyses.length; }
    get hasAnalyses() { return this.analyses.length > 0; }

    // ── Analysis form ─────────────────────────────────────────
    toggleAnalysisForm() {
        this.showAnalysisForm = !this.showAnalysisForm;
        if (this.showAnalysisForm) {
            this.af = {
                displayVisibility: 'Good', promoActive: 'No / Yes - Ours',
                dealerPreference: 'Neutral', demandTrend: 'Stable', priceSensitivity: 'Medium'
            };
        }
    }
    afText(e) { this.af = { ...this.af, [e.target.name]: e.target.value }; }
    afNum(e) { this.af = { ...this.af, [e.target.name]: e.target.value === '' ? null : Number(e.target.value) }; }
    afPick(e) { this.af = { ...this.af, [e.target.dataset.field]: e.detail.value }; }

    saveAnalysis() {
        if (!this.af.competitorName) { this.toast('Analysis', 'Competitor name is required', 'warning'); return; }
        this.isSavingAnalysis = true;
        saveMarketAnalysis({
            itemId: this.detail.id,
            competitorName: this.af.competitorName,
            competitorProduct: this.af.competitorProduct,
            ourProduct: this.af.ourProduct,
            competitorPrice: this.af.competitorPrice,
            ourPrice: this.af.ourPrice,
            competitorStock: this.af.competitorStock,
            ourStock: this.af.ourStock,
            shelfShare: this.af.shelfShare,
            displayVisibility: this.af.displayVisibility,
            promoActive: this.af.promoActive,
            dealerPreference: this.af.dealerPreference,
            demandTrend: this.af.demandTrend,
            priceSensitivity: this.af.priceSensitivity
        })
            .then(() => {
                this.toast('Saved', 'Market analysis recorded', 'success');
                this.showAnalysisForm = false;
                return this.loadAnalyses(this.detail.id);
            })
            .catch(err => this.toastError('Save analysis', err))
            .finally(() => { this.isSavingAnalysis = false; });
    }

    refreshBusy() {
        this.items = this.items.map(i => ({ ...i, busy: this.busyItemId === i.id }));
    }

    // ── Utils ─────────────────────────────────────────────────
    fmtMins(mins) {
        if (!mins) return '0m';
        const h = Math.floor(mins/60), m = mins % 60;
        if (h && m) return `${h}h ${m}m`;
        if (h) return `${h}h`;
        return `${m}m`;
    }
    toast(title, message, variant) { this.dispatchEvent(new ShowToastEvent({ title, message, variant })); }
    toastError(ctx, err) {
        const msg = (err && err.body && err.body.message) || (err && err.message) || 'Unexpected error';
        this.dispatchEvent(new ShowToastEvent({ title: ctx, message: msg, variant: 'error' }));
    }
}
