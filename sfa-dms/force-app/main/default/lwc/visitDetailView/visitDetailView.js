import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

// ── Apex: Visit ──────────────────────────────────────────────────
import checkOutVisit       from '@salesforce/apex/VisitDayVisitsController.checkOutVisit';
import getVisitDetails     from '@salesforce/apex/VisitDayVisitsController.getVisitDetails';
import updateVisitNotes    from '@salesforce/apex/VisitDayVisitsController.updateVisitNotes';

// ── Apex: Primary Orders ─────────────────────────────────────────
import getVisitOrders          from '@salesforce/apex/PrimaryOrderController.getVisitOrders';
import getOrderCreationFields  from '@salesforce/apex/PrimaryOrderController.getOrderCreationFields';
import getPrimaryRecordTypeId  from '@salesforce/apex/PrimaryOrderController.getPrimaryRecordTypeId';

// ── Apex: Competitor Analysis ────────────────────────────────────
import saveCompetitorAnalysis    from '@salesforce/apex/CompetitorAnalysisController.saveCompetitorAnalysis';
import getVisitCompetitorAnalysis from '@salesforce/apex/CompetitorAnalysisController.getVisitCompetitorAnalysis';

export default class VisitDetailView extends LightningElement {

    // ── Public props injected by parent (dashboardComponent) ─────
    @api visitId;
    @api checkInTime;
    @api checkInLat;
    @api checkInLng;
    @api checkInAddress;

    // ── Visit data object ─────────────────────────────────────────
    @track visit = {
        account:           '—',
        accountId:         null,
        accountEmail:       '—',
        visitDate:         null,
        visitType:         '—',
        purpose:           '—',
        status:            'In Progress',
        statusClass:       'status-inprogress',
        priority:          '—',
        phone:             '—',
        address:           '—',
        contactPerson:     '—',
        lastOrderDate:     '—',
        outstandingAmount: '₹0',
        checkInTime:       '—',
        checkInAddress:    '—',
        checkInCoords:     '—',
        checkOutTime:      null,
        checkOutAddress:   '—',
        notes:             ''
    };

    // ── Active tab ────────────────────────────────────────────────
    @track activeTab = 'detail';

    // ── Loading states ────────────────────────────────────────────
    @track isLoadingVisit          = true;
    @track isLoadingOrders         = false;
    @track isLoadingCreationFields = false;

    // ── Primary Orders ────────────────────────────────────────────
    @track orders              = [];
    @track showOrderModal      = false;
    @track orderCreationFields = [];
    @track primaryRecordTypeId = null;

    // ── Navigation: selected order → primaryOrderDetail ───────────
    @track selectedOrderId = null;

    // ── Competitor Analysis ───────────────────────────────────────
    @track competitorRecords       = [];
    @track showCompetitorModal     = false;
    @track isCompetitorSubmitting  = false;
    @track competitorForm = {
        competitorName:    '', competitorProduct: '', competitorPrice: '',
        competitorStock:   '', ourStock:           '', ourPrice:        '',
        shelfSharePercent: '', displayVisibility:  '', promoActive:     'No',
        dealerPreference:  '', demandTrend:        '', priceSensitivity: '',
        remarks:           ''
    };
    @track competitorErrors = {};

    // ── Notes ─────────────────────────────────────────────────────
    @track isEditingNotes = false;
    @track draftNotes     = '';

    // ── Check-out state ───────────────────────────────────────────
    @track isCheckedOut      = false;
    @track isCheckingOut     = false;
    @track checkOutTimeValue = null;

    // ═════════════════════════════════════════════════════════════
    // LIFECYCLE
    // ═════════════════════════════════════════════════════════════
    connectedCallback() {
        this.loadVisitDetails();
        this.loadOrderCreationConfig();
        this.loadVisitOrders();
        this.loadCompetitorRecords();
    }

    // ═════════════════════════════════════════════════════════════
    // DATA LOADERS — all backend-driven
    // ═════════════════════════════════════════════════════════════

    /** Fetch complete visit + account details from Apex */
    loadVisitDetails() {
        if (!this.visitId) {
            this.isLoadingVisit = false;
            return;
        }
        this.isLoadingVisit = true;

        getVisitDetails({ visitId: this.visitId })
            .then(result => {
                if (!result) return;

                // Check-in coords: prefer props passed by parent
                let ciCoords = '—';
                if (this.checkInLat && this.checkInLng) {
                    ciCoords = `${parseFloat(this.checkInLat).toFixed(6)}, ${parseFloat(this.checkInLng).toFixed(6)}`;
                } else if (result.checkInCoords) {
                    ciCoords = result.checkInCoords;
                }

                this.visit = {
                    ...this.visit,
                    accountId:         result.accountId,
                    account:           result.account           || '—',
                    accountEmail:       result.accountEmail     || '—',
                    phone:             result.phone             || '—',
                    address:           result.address           || '—',
                    contactPerson:     result.contactPerson     || '—',
                    visitDate:         result.visitDate,
                    visitType:         result.visitType         || '—',
                    purpose:           result.purpose           || '—',
                    status:            result.status            || 'In Progress',
                    statusClass:       this.getStatusClass(result.status),
                    priority:          result.priority          || '—',
                    notes:             result.notes             || '',
                    lastOrderDate:     result.lastOrderDate     || '—',
                    outstandingAmount: result.outstandingAmount || '₹0',
                    // Check-in: parent props take precedence
                    checkInTime:    this.formatDateTime(this.checkInTime || result.checkInTime),
                    checkInAddress: this.checkInAddress || result.checkInAddress || '—',
                    checkInCoords:  ciCoords,
                    // Check-out
                    checkOutAddress: result.checkOutAddress || '—'
                };

                this.draftNotes = this.visit.notes;

                // Reflect already-checked-out status
                if (result.status === 'Completed') {
                    this.isCheckedOut = true;
                    if (result.checkOutTime) {
                        this.checkOutTimeValue = new Date(result.checkOutTime);
                    }
                }
            })
            .catch(err => console.error('getVisitDetails error', err))
            .finally(() => { this.isLoadingVisit = false; });
    }

    /**
     * Load fieldset fields for the Create-Order form and the
     * Primary RecordType ID in parallel.
     */
    loadOrderCreationConfig() {
        this.isLoadingCreationFields = true;

        Promise.all([
            getOrderCreationFields(),
            getPrimaryRecordTypeId()
        ])
            .then(([fields, rtId]) => {
                this.orderCreationFields  = fields || [];
                this.primaryRecordTypeId  = rtId   || null;
            })
            .catch(err => console.error('loadOrderCreationConfig error', err))
            .finally(() => { this.isLoadingCreationFields = false; });
    }

    /** Fetch Orders linked to this visit from Apex */
    loadVisitOrders() {
        if (!this.visitId) return;
        this.isLoadingOrders = true;

        getVisitOrders({ visitId: this.visitId })
            .then(result => {
                this.orders = (result || []).map(o => ({
                    id:            o.id,
                    orderNumber:   o.orderNumber   || '—',
                    effectiveDate: o.effectiveDate
                        ? new Date(o.effectiveDate).toLocaleDateString('en-IN', {
                              day: 'numeric', month: 'short', year: 'numeric'
                          })
                        : '—',
                    totalAmount:  this.formatCurrency(o.totalAmount),
                    status:       o.status        || 'Draft',
                    statusClass:  this.getOrderStatusClass(o.status)
                }));
            })
            .catch(err => console.error('loadVisitOrders error', err))
            .finally(() => { this.isLoadingOrders = false; });
    }

    /** Fetch Competitor Analysis records for this visit */
    loadCompetitorRecords() {
        if (!this.visitId) return;

        getVisitCompetitorAnalysis({ visitId: this.visitId })
            .then(result => {
                this.competitorRecords = (result || []).map(r => ({
                    id:                r.Id,
                    competitorName:    r.Competitor_Name__c    || '—',
                    competitorProduct: r.Competitor_Product__c || '—',
                    competitorPrice:   this.formatCurrency(r.Competitor_Price__c),
                    ourPrice:          this.formatCurrency(r.Our_Price__c),
                    competitorStock:   r.Competitor_Stock__c  || 0,
                    ourStock:          r.Our_Stock__c          || 0,
                    shelfSharePercent: r.Shelf_Share_Percent__c || 0,
                    remarks:           r.Remarks__c            || '',
                    recordDate: r.CreatedDate
                        ? new Date(r.CreatedDate).toLocaleDateString('en-IN', {
                              day: 'numeric', month: 'short', year: 'numeric'
                          })
                        : '—'
                }));
            })
            .catch(err => console.error('loadCompetitorRecords error', err));
    }

    // ═════════════════════════════════════════════════════════════
    // GETTERS
    // ═════════════════════════════════════════════════════════════

    get accountInitial() {
        return (this.visit.account || 'A').charAt(0).toUpperCase();
    }

    get visitDateDisplay() {
        if (!this.visit.visitDate) return '—';
        try {
            return new Date(this.visit.visitDate).toLocaleDateString('en-IN', {
                weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
            });
        } catch { return '—'; }
    }

    get checkOutTimeDisplay() {
        if (!this.checkOutTimeValue) return '—';
        return this.checkOutTimeValue.toLocaleTimeString('en-IN', {
            hour: '2-digit', minute: '2-digit', hour12: true
        });
    }

    get visitDuration() {
        if (!this.checkInTime || !this.checkOutTimeValue) return '—';
        try {
            const ms   = this.checkOutTimeValue - new Date(this.checkInTime);
            const mins = Math.floor(ms / 60000);
            const h    = Math.floor(mins / 60);
            const m    = mins % 60;
            return h > 0 ? `${h}h ${m}m` : `${m}m`;
        } catch { return '—'; }
    }

    get notesDisplay() {
        return this.visit.notes || 'No notes added yet. Tap Edit to add visit notes.';
    }

    // Tab class helpers
    get detailTabClass()     { return this.activeTab === 'detail'     ? 'vdv-tab active' : 'vdv-tab'; }
    get ordersTabClass()     { return this.activeTab === 'orders'     ? 'vdv-tab active' : 'vdv-tab'; }
    get competitorTabClass() { return this.activeTab === 'competitor' ? 'vdv-tab active' : 'vdv-tab'; }

    get isDetailTab()     { return this.activeTab === 'detail'; }
    get isOrdersTab()     { return this.activeTab === 'orders'; }
    get isCompetitorTab() { return this.activeTab === 'competitor'; }

    // Counts & empty-state flags
    get orderCount()      { return this.orders.length; }
    get competitorCount() { return this.competitorRecords.length; }
    get hasOrders()       { return !this.isLoadingOrders && this.orders.length > 0; }

    // Fieldset empty-state helpers
    get hasCreationFields()   { return !this.isLoadingCreationFields && this.orderCreationFields.length > 0; }
    get hasNoCreationFields() { return !this.isLoadingCreationFields && this.orderCreationFields.length === 0; }

    // Grand total across all orders
    get totalOrderValue() {
        const sum = this.orders.reduce((acc, o) => {
            const n = parseFloat((o.totalAmount || '0').replace(/[^0-9.]/g, '')) || 0;
            return acc + n;
        }, 0);
        return sum.toLocaleString('en-IN', { minimumFractionDigits: 2 });
    }

    // ═════════════════════════════════════════════════════════════
    // TAB & BACK NAVIGATION
    // ═════════════════════════════════════════════════════════════

    switchTab(event) {
        this.activeTab = event.currentTarget.dataset.tab;
    }

    /** Fire 'back' event so dashboardComponent can restore the visit list */
    handleBack() {
        this.dispatchEvent(new CustomEvent('back'));
    }

    // ═════════════════════════════════════════════════════════════
    // ORDER NAVIGATION — open primaryOrderDetail inline
    // ═════════════════════════════════════════════════════════════

    /** Clicking any cell (or the View button) on an order row navigates to detail */
    handleOrderRowClick(event) {
        event.stopPropagation();
        const orderId = event.currentTarget.dataset.id;
        if (orderId) {
            this.selectedOrderId = orderId;
        }
    }

    /** Back button inside primaryOrderDetail fires 'back'; we clear the selection */
    handleOrderDetailBack() {
        this.selectedOrderId = null;
        // Refresh list in case status/total changed while in detail view
        this.loadVisitOrders();
    }

    // ═════════════════════════════════════════════════════════════
    // CHECK OUT
    // ═════════════════════════════════════════════════════════════

    async handleCheckOut() {
        if (this.isCheckedOut || this.isCheckingOut) return;
        this.isCheckingOut = true;

        try {
            const pos = await this.getGPS();
            const now = new Date();

            await checkOutVisit({
                visitId: this.visitId,
                lat:     String(pos.latitude),
                lng:     String(pos.longitude),
                address: pos.address || `${pos.latitude.toFixed(4)}, ${pos.longitude.toFixed(4)}`
            });

            this.isCheckedOut      = true;
            this.checkOutTimeValue = now;
            this.visit = {
                ...this.visit,
                status:          'Completed',
                statusClass:     'status-completed',
                checkOutAddress: pos.address || '—'
            };

            this.dispatchEvent(new CustomEvent('checkout', {
                detail: { visitId: this.visitId, checkOutTime: now }
            }));
            this.showToast('Checked out successfully', 'success');
        } catch (err) {
            console.error('Check out error', err);
            this.showToast('Failed to check out: ' + (err.message || 'Location unavailable'), 'error');
        } finally {
            this.isCheckingOut = false;
        }
    }

    // ═════════════════════════════════════════════════════════════
    // PRIMARY ORDER — lightning-record-edit-form with backend fieldset
    // ═════════════════════════════════════════════════════════════

    openPunchOrder() {
        this.showOrderModal = true;
    }

    closeOrderModal() {
        this.showOrderModal = false;
    }

    /**
     * Intercept the form submit to inject mandatory fields that
     * should not appear in the fieldset (RecordTypeId, AccountId,
     * EffectiveDate, Status, Visit__c lookup).
     */
    handleOrderSubmit(event) {
        event.preventDefault();
        const fields = { ...event.detail.fields };

        // ── Mandatory injections ──────────────────────────────────
        if (this.primaryRecordTypeId) {
            fields.RecordTypeId = this.primaryRecordTypeId;
        }
        if (this.visit.accountId) {
            fields.AccountId = this.visit.accountId;
        }
        // EffectiveDate is required on Order
        if (!fields.EffectiveDate) {
            fields.EffectiveDate = new Date().toISOString().split('T')[0];
        }
        // Status must be 'Draft' on creation
        if (!fields.Status) {
            fields.Status = 'Draft';
        }
        // Link Order to Visit (custom lookup — adjust API name if needed)
        if (this.visitId) {
            fields.Visit__c = this.visitId;
        }

        event.target.submit(fields);
    }

    /** Called when lightning-record-edit-form successfully creates the Order */
    handleOrderSuccess(event) {
        const newOrderId = event.detail.id;
        this.showOrderModal = false;

        // Refresh orders list
        this.loadVisitOrders();

        this.showToast('Primary order created successfully!', 'success');

        // Navigate directly into the newly created order's detail view
        if (newOrderId) {
            this.selectedOrderId = newOrderId;
        }
    }

    /** Called when lightning-record-edit-form encounters an error */
    handleOrderFormError(event) {
        console.error('Order form error', event.detail);
        this.showToast(
            event.detail?.detail || 'Failed to create order. Check required fields.',
            'error'
        );
    }

    // ═════════════════════════════════════════════════════════════
    // COMPETITOR ANALYSIS
    // ═════════════════════════════════════════════════════════════

    openCompetitorForm() {
        this.competitorForm = {
            competitorName:    '', competitorProduct: '', competitorPrice: '',
            competitorStock:   '', ourStock:           '', ourPrice:        '',
            shelfSharePercent: '', displayVisibility:  '', promoActive:     'No',
            dealerPreference:  '', demandTrend:        '', priceSensitivity: '',
            remarks:           ''
        };
        this.competitorErrors = {};
        this.showCompetitorModal = true;
    }

    closeCompetitorModal() { this.showCompetitorModal = false; }

    handleCompetitorFormChange(event) {
        const { name, value } = event.target;
        this.competitorForm = { ...this.competitorForm, [name]: value };
    }

    async submitCompetitorAnalysis() {
        if (!this.competitorForm.competitorName) {
            this.competitorErrors = { competitorName: 'Please select a competitor' };
            return;
        }
        this.isCompetitorSubmitting = true;
        try {
            const newId = await saveCompetitorAnalysis({
                visitId:           this.visitId,
                competitorName:    this.competitorForm.competitorName,
                competitorProduct: this.competitorForm.competitorProduct,
                competitorPrice:   parseFloat(this.competitorForm.competitorPrice)   || null,
                competitorStock:   parseInt(this.competitorForm.competitorStock)     || null,
                ourStock:          parseInt(this.competitorForm.ourStock)            || null,
                ourPrice:          parseFloat(this.competitorForm.ourPrice)          || null,
                shelfSharePercent: parseFloat(this.competitorForm.shelfSharePercent) || null,
                displayVisibility: this.competitorForm.displayVisibility,
                promoActive:       this.competitorForm.promoActive,
                dealerPreference:  this.competitorForm.dealerPreference,
                demandTrend:       this.competitorForm.demandTrend,
                priceSensitivity:  this.competitorForm.priceSensitivity,
                remarks:           this.competitorForm.remarks
            });

            // Optimistic update
            this.competitorRecords = [...this.competitorRecords, {
                id:                newId,
                competitorName:    this.competitorForm.competitorName,
                competitorProduct: this.competitorForm.competitorProduct,
                competitorPrice:   this.formatCurrency(this.competitorForm.competitorPrice),
                ourPrice:          this.formatCurrency(this.competitorForm.ourPrice),
                competitorStock:   this.competitorForm.competitorStock   || 0,
                ourStock:          this.competitorForm.ourStock          || 0,
                shelfSharePercent: this.competitorForm.shelfSharePercent || 0,
                recordDate: new Date().toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric'
                })
            }];

            this.showCompetitorModal = false;
            this.activeTab = 'competitor';
            this.showToast('Competitor analysis saved!', 'success');
        } catch (err) {
            this.showToast('Failed to save analysis: ' + (err?.body?.message || err.message), 'error');
        } finally {
            this.isCompetitorSubmitting = false;
        }
    }

    // ═════════════════════════════════════════════════════════════
    // NOTES
    // ═════════════════════════════════════════════════════════════

    toggleEditNotes() {
        this.isEditingNotes = !this.isEditingNotes;
        if (this.isEditingNotes) this.draftNotes = this.visit.notes || '';
    }

    handleNotesInput(event) { this.draftNotes = event.target.value; }

    saveNotes() {
        if (!this.visitId) return;
        updateVisitNotes({ visitId: this.visitId, notes: this.draftNotes })
            .then(() => {
                this.visit          = { ...this.visit, notes: this.draftNotes };
                this.isEditingNotes = false;
                this.showToast('Notes saved', 'success');
            })
            .catch(() => this.showToast('Failed to save notes', 'error'));
    }

    // ═════════════════════════════════════════════════════════════
    // UTILITIES
    // ═════════════════════════════════════════════════════════════

    stopProp(event) { event.stopPropagation(); }

    getGPS() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return; }
            navigator.geolocation.getCurrentPosition(
                p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, address: '' }),
                e => reject(e),
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        });
    }

    formatDateTime(val) {
        if (!val) return '—';
        try {
            return new Date(val).toLocaleTimeString('en-IN', {
                hour: '2-digit', minute: '2-digit', hour12: true
            });
        } catch { return '—'; }
    }

    formatCurrency(val) {
        if (val == null || val === '') return '0';
        return parseFloat(val).toLocaleString('en-IN', { maximumFractionDigits: 2 });
    }

    getStatusClass(status) {
        const map = {
            'Completed'  : 'status-completed',
            'In Progress': 'status-inprogress',
            'Planned'    : 'status-scheduled',
            'Scheduled'  : 'status-scheduled',
            'Pending'    : 'status-pending',
            'Cancelled'  : 'status-cancelled'
        };
        return map[status] || 'status-pending';
    }

    getOrderStatusClass(status) {
        const map = {
            'Draft'     : 'vdv-status-draft',
            'Activated' : 'vdv-status-approved',
            'Submitted' : 'vdv-status-submitted',
            'Approved'  : 'vdv-status-approved',
            'Rejected'  : 'vdv-status-rejected',
            'Completed' : 'vdv-status-approved',
            'Cancelled' : 'vdv-status-rejected'
        };
        return map[status] || 'vdv-status-draft';
    }

    showToast(message, variant) {
        try {
            this.dispatchEvent(new ShowToastEvent({
                title:   variant === 'success' ? 'Success' : 'Error',
                message: message,
                variant: variant
            }));
        } catch { console.log(`[${variant}] ${message}`); }
    }

    // ── Public setter: parent can still pre-populate visit data ──
    @api
    setVisitData(data) {
        if (!data) return;
        this.visit = {
            ...this.visit,
            account:           data.account          || this.visit.account,
            accountId:         data.accountId        || this.visit.accountId,
            visitDate:         data.visitDate        || this.visit.visitDate,
            visitType:         data.visitType        || this.visit.visitType,
            purpose:           data.purpose          || this.visit.purpose,
            status:            data.status           || this.visit.status,
            statusClass:       this.getStatusClass(data.status),
            priority:          data.priority         || this.visit.priority,
            contactPerson:     data.contactPerson    || this.visit.contactPerson,
            phone:             data.phone            || this.visit.phone,
            address:           data.address          || this.visit.address,
            accountType:       data.accountType      || this.visit.accountType,
            lastOrderDate:     data.lastOrderDate    || this.visit.lastOrderDate,
            outstandingAmount: data.outstandingAmount || this.visit.outstandingAmount,
            notes:             data.notes            || this.visit.notes
        };
        this.draftNotes = this.visit.notes;
    }
}