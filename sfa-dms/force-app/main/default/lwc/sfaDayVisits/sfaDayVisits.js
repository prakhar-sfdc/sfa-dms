import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getDayPlan from '@salesforce/apex/JourneyPlanController.getDayPlan';
import reorderVisits from '@salesforce/apex/JourneyPlanController.reorderVisits';
import deleteVisit from '@salesforce/apex/JourneyPlanController.deleteVisit';
import updateVisitNotes from '@salesforce/apex/JourneyPlanController.updateVisitNotes';

export default class SfaDayVisits extends LightningElement {
    _planDate;
    @track items = [];
    @track plan = {};
    @track isLoading = false;
    @track expandedId = null;
    @track editingId = null;
    @track notesDraft = '';

    @api
    get planDate() { return this._planDate; }
    set planDate(value) {
        this._planDate = value;
        if (value) this.load();
    }

    @api refresh() { this.load(); }

    // ── Load ──────────────────────────────────────────────────
    load() {
        if (!this._planDate) return;
        this.isLoading = true;
        this.expandedId = null;
        this.editingId = null;
        getDayPlan({ planDate: this._planDate })
            .then(res => {
                this.plan = res || {};
                this.items = (res && res.items ? res.items : []).map((it, idx) => this.decorate(it, idx));
                this.dispatchEvent(new CustomEvent('loaded', { detail: { plan: this.plan } }));
            })
            .catch(err => this.toastError('Load visits', err))
            .finally(() => { this.isLoading = false; });
    }

    decorate(it, idx) {
        const completed = it.status === 'Completed';
        return {
            ...it,
            seq: idx + 1,
            priorityClass: `pill priority-${(it.priority || 'Medium').toLowerCase()}`,
            statusClass: `pill status-${(it.status || '').toLowerCase().replace(/\s+/g, '-')}`,
            showRoute: completed,
            distanceDisplay: (it.distanceFromPrev !== null && it.distanceFromPrev !== undefined) ? `${it.distanceFromPrev} km` : '—',
            travelDisplay: it.travelFromPrev ? this.fmtMins(it.travelFromPrev) : '—',
            durationDisplay: it.actualDuration ? this.fmtMins(it.actualDuration) : '—',
            checkInCoords: (it.checkInLat != null && it.checkInLng != null) ? `${it.checkInLat}, ${it.checkInLng}` : '—',
            checkOutCoords: (it.checkOutLat != null && it.checkOutLng != null) ? `${it.checkOutLat}, ${it.checkOutLng}` : '—',
            checkInTimeD: it.checkInTime || '—',
            checkOutTimeD: it.checkOutTime || '—',
            checkInAddrD: it.checkInAddress || '—',
            checkOutAddrD: it.checkOutAddress || '—',
            outcomeD: it.outcome || '—',
            purposeD: it.purpose || '—',
            plannedTimeD: it.plannedTime || '—',
            locationD: it.location || '—',
            notesD: it.notes || 'No notes recorded.'
        };
    }

    // ── View model (overlays expand / edit flags) ─────────────
    get viewItems() {
        return this.items.map(it => {
            const expanded = it.id === this.expandedId;
            const isEditing = it.id === this.editingId;
            return {
                ...it,
                expanded,
                isEditing,
                rowClass: expanded ? 'visit-row expanded' : 'visit-row',
                chevronClass: expanded ? 'chev open' : 'chev'
            };
        });
    }

    get hasItems() { return this.items.length > 0; }
    get notesDraftValue() { return this.notesDraft; }
    get dayLabel() {
        if (!this._planDate) return '';
        const d = new Date(this._planDate + 'T00:00:00');
        return d.toLocaleDateString('en-IN', { weekday: 'long', month: 'short', day: 'numeric' });
    }
    get summaryLine() {
        const p = this.plan || {};
        const dist = (p.totalDistance || 0).toFixed(1);
        return `${p.plannedVisits || 0} planned · ${p.completedVisits || 0} done · ${dist} km`;
    }

    // ── Expand / notes ────────────────────────────────────────
    toggleExpand(event) {
        const id = event.currentTarget.dataset.id;
        this.expandedId = this.expandedId === id ? null : id;
        if (this.editingId && this.editingId !== this.expandedId) this.editingId = null;
    }
    startEdit(event) {
        event.stopPropagation();
        const id = event.currentTarget.dataset.id;
        const item = this.items.find(i => i.id === id);
        this.editingId = id;
        this.expandedId = id;
        this.notesDraft = item && item.notes ? item.notes : '';
    }
    handleNotesChange(event) { this.notesDraft = event.detail ? event.detail.value : event.target.value; }
    cancelEdit() { this.editingId = null; }
    saveNotes() {
        const id = this.editingId;
        const notes = this.notesDraft;
        updateVisitNotes({ itemId: id, notes })
            .then(() => {
                this.items = this.items.map(i => i.id === id ? { ...i, notes, notesD: notes || 'No notes recorded.' } : i);
                this.editingId = null;
                this.toast('Saved', 'Visit notes updated', 'success');
                this.dispatchEvent(new CustomEvent('datachanged'));
            })
            .catch(err => this.toastError('Save notes', err));
    }

    // ── Reorder / delete / add ────────────────────────────────
    moveUp(event) { event.stopPropagation(); this.move(event.currentTarget.dataset.id, -1); }
    moveDown(event) { event.stopPropagation(); this.move(event.currentTarget.dataset.id, 1); }
    move(id, delta) {
        const idx = this.items.findIndex(i => i.id === id);
        const target = idx + delta;
        if (idx < 0 || target < 0 || target >= this.items.length) return;
        const ids = this.items.map(i => i.id);
        const [moved] = ids.splice(idx, 1);
        ids.splice(target, 0, moved);
        reorderVisits({ orderedItemIds: ids })
            .then(() => { this.load(); this.dispatchEvent(new CustomEvent('datachanged')); })
            .catch(err => this.toastError('Reorder', err));
    }
    removeVisit(event) {
        event.stopPropagation();
        deleteVisit({ itemId: event.currentTarget.dataset.id })
            .then(() => {
                this.toast('Removed', 'Visit removed from plan', 'success');
                this.load();
                this.dispatchEvent(new CustomEvent('datachanged'));
            })
            .catch(err => this.toastError('Delete', err));
    }
    addVisit() {
        this.dispatchEvent(new CustomEvent('addvisit', { detail: { date: this._planDate } }));
    }

    // ── Utils ─────────────────────────────────────────────────
    fmtMins(mins) {
        if (!mins) return '0m';
        const h = Math.floor(mins / 60), m = mins % 60;
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
