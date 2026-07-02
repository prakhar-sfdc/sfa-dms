import { LightningElement, wire, track } from 'lwc';
import { CurrentPageReference }        from 'lightning/navigation';
import { ShowToastEvent }              from 'lightning/platformShowToastEvent';
import { refreshApex }                 from '@salesforce/apex';
import getSchemesForOrder              from '@salesforce/apex/SchemeController.getSchemesForOrder';
import applyScheme                     from '@salesforce/apex/SchemeController.applyScheme';

export default class OrderSchemeSelector extends LightningElement {

    // recordId resolved from CurrentPageReference (Experience Portal)
    @track recordId = null;

    // raw wire result kept for refreshApex
    _wiredResult;

    // decorated scheme array for the template
    @track schemes = [];

    // set of schemeIds currently mid-apply (shows spinner per card)
    @track applyingIds = new Set();

    // top-level flags
    @track isLoadingData = true;
    @track loadError     = null;

    // ── Resolve recordId from Experience Portal page ref ─────────
    @wire(CurrentPageReference)
    handlePageRef(ref) {
        if (!ref) return;
        const id =
            ref.attributes?.recordId   ||   // standard record page
            ref.state?.recordId        ||   // query-param style
            null;

        console.log('[SchemeSelector] CurrentPageReference resolved | recordId=', id);
        console.log('[SchemeSelector] Full page ref=', JSON.stringify(ref));

        if (id !== this.recordId) {
            this.recordId = id;
        }
    }

    // ── Wire: fetch eligible schemes ─────────────────────────────
    @wire(getSchemesForOrder, { orderId: '$recordId' })
    wiredSchemes(result) {
        this._wiredResult = result;

        if (result.data !== undefined) {
            this.isLoadingData = false;
        }

        if (result.data) {
            console.log('[SchemeSelector] raw wire data=', JSON.stringify(result.data));
            this.loadError = null;
            this.schemes   = result.data.map(s => this.decorate(s));
            console.log('[SchemeSelector] decorated schemes=', this.schemes.length);
        } else if (result.error) {
            this.isLoadingData = false;
            const msg =
                result.error?.body?.message ||
                result.error?.message       ||
                'Failed to load schemes.';
            this.loadError = msg;
            console.error('[SchemeSelector] wire error=', JSON.stringify(result.error));
        }
    }

    // ── Decorate a raw Apex wrapper into template-ready shape ─────
    decorate(s) {
        const typeKey    = this.typeKey(s.schemeType);
        const isApplying = this.applyingIds.has(s.schemeId);
        const applied    = !!s.alreadyApplied;
        const disabled   = applied || isApplying;

        // Benefit display string
        let benefitDisplay = '';
        if (s.schemeType === 'Free Product') {
            benefitDisplay = 'Free item(s) added to order';
        } else if (s.benefit && s.benefit > 0) {
            benefitDisplay = '₹' + Number(s.benefit).toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        } else {
            benefitDisplay = '—';
        }

        return {
            ...s,
            cardClass:    `scheme-card card-${typeKey}`,
            chipClass:    `type-chip chip-${typeKey}`,
            blobClass:    `blob blob-${typeKey}`,
            benefitClass: `benefit-amount ${applied ? 'benefit-muted' : 'benefit-' + typeKey}`,
            benefitDisplay,
            btnClass:  applied   ? 'btn btn-done'
                     : isApplying ? 'btn btn-loading'
                     : `btn btn-${typeKey}`,
            btnLabel:  applied    ? '✓ Applied'
                     : isApplying ? 'Applying…'
                     : 'Apply Scheme',
            btnDisabled: disabled,
            isApplying
        };
    }

    typeKey(type) {
        if (type === 'Slab Based')   return 'slab';
        if (type === 'Free Product') return 'free';
        if (type === 'Discount')     return 'discount';
        return 'default';
    }

    // ── Getters ───────────────────────────────────────────────────
    get hasSchemes()  { return this.schemes && this.schemes.length > 0; }
    get schemeCount() { return this.schemes?.length ?? 0; }

    // ── Apply handler ─────────────────────────────────────────────
    handleApply(event) {
        event.stopPropagation();
        const schemeId = event.currentTarget.dataset.id;
        if (!schemeId || !this.recordId) {
            console.warn('[SchemeSelector] missing schemeId or recordId', schemeId, this.recordId);
            return;
        }

        console.log('[SchemeSelector] applying | schemeId=', schemeId, '| orderId=', this.recordId);

        // Mark this card as "applying" → show spinner
        this.applyingIds = new Set([...this.applyingIds, schemeId]);
        this.schemes     = this.schemes.map(s => this.decorate(s));

        applyScheme({ orderId: this.recordId, schemeId })
            .then(() => {
                console.log('[SchemeSelector] apply success | schemeId=', schemeId);
                this.showToast('Scheme Applied 🎉', 'The scheme has been applied to your order.', 'success');
                return refreshApex(this._wiredResult);
            })
            .catch(err => {
                console.error('[SchemeSelector] apply error=', JSON.stringify(err));
                const msg =
                    err?.body?.message ||
                    err?.message       ||
                    'Something went wrong. Please try again.';
                this.showToast('Could Not Apply Scheme', msg, 'error');
            })
            .finally(() => {
                // Remove from applying set regardless of outcome
                const updated = new Set([...this.applyingIds]);
                updated.delete(schemeId);
                this.applyingIds = updated;
                this.schemes     = this.schemes.map(s => this.decorate(s));
            });
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}