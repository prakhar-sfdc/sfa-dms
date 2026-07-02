// inventoryOrderManager.js
import { LightningElement, api, track, wire } from 'lwc';
import { getRecord } from 'lightning/uiRecordApi';
import getInventory from '@salesforce/apex/InventoryController.getInventory';
import createOrderItems from '@salesforce/apex/InventoryController.createOrderItems';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

const FIELDS = ['Order.RecordType.DeveloperName'];

export default class AddProductComp extends LightningElement {

    @api recordId;
    @track products   = [];
    @track isLoading  = false;
    @track isSaving   = false;
    @track errorMessage = '';

    recordType;

    // ── Getters ───────────────────────────────────────────────────────────────
    get hasProducts() {
        return !this.isLoading && this.products.length > 0;
    }

    get isEmpty() {
        return !this.isLoading && !this.hasError && this.products.length === 0;
    }

    get hasError() {
        return !!this.errorMessage;
    }

    // ── Wire: get Order RecordType ────────────────────────────────────────────
    @wire(getRecord, { recordId: '$recordId', fields: FIELDS })
    wiredOrder({ data, error }) {
        if (data) {
            try {
                this.recordType = data.fields.RecordType.value.fields.DeveloperName.value;
                console.log('Record Type:', this.recordType);
                this.loadInventory();
            } catch (e) {
                this.errorMessage = 'Could not read Order Record Type. ' + e.message;
                console.error('Wire error:', e);
            }
        } else if (error) {
            this.errorMessage = 'Failed to load Order details.';
            console.error('getRecord error:', JSON.stringify(error));
        }
    }

    // ── Load Inventory ────────────────────────────────────────────────────────
    loadInventory() {
        this.isLoading    = true;
        this.errorMessage = '';
        this.products     = [];

        getInventory({ recordType: this.recordType })
            .then(res => {
                console.log('Inventory loaded:', JSON.stringify(res));
                this.products = res.map((item, index) => ({
                    index,
                    productId:      item.productId,
                    productName:    item.productName,
                    availableStock: item.availableStock,
                    unitPrice:      item.unitPrice,
                    inventoryId:    item.inventoryId,
                    quantity:       0
                }));
            })
            .catch(err => {
                this.errorMessage = err?.body?.message || err?.message || 'Failed to load inventory.';
                console.error('getInventory error:', JSON.stringify(err));
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    // ── Handle Quantity Change ────────────────────────────────────────────────
    handleQtyChange(event) {
        const inventoryId = event.target.dataset.id;
        const newQty      = parseFloat(event.target.value) || 0;

        this.products = this.products.map(p =>
            p.inventoryId === inventoryId
                ? { ...p, quantity: newQty }
                : p
        );

        console.log('Updated qty for:', inventoryId, '→', newQty);
    }

    // ── Handle Save ───────────────────────────────────────────────────────────
    async handleSave() {
        console.log('Handle Save Clicked');

        // Validate quantities against available stock
        const overstock = this.products.find(
            p => p.quantity > 0 && p.quantity > p.availableStock
        );
        if (overstock) {
            this.showToast(
                'Error',
                `Quantity for "${overstock.productName}" exceeds available stock of ${overstock.availableStock}`,
                'error'
            );
            return;
        }

        const payload = this.products
            .filter(p => p.quantity > 0)
            .map(p => ({
                productId:   p.productId,
                quantity:    p.quantity,
                inventoryId: p.inventoryId
            }));

        if (payload.length === 0) {
            this.showToast('Warning', 'Please enter at least one quantity.', 'warning');
            return;
        }

        console.log('Payload:', JSON.stringify(payload));

        this.isSaving = true;

        try {
            await createOrderItems({
                orderId:    this.recordId,
                recordType: this.recordType,
                payload:    JSON.stringify(payload)
            });

            this.showToast('Success', 'Products added to Order successfully.', 'success');
            this.dispatchEvent(new CustomEvent('productsaved')); 
            this.loadInventory();  // refresh inventory stock counts

        } catch (error) {
            const msg = error?.body?.message || error?.message || 'Failed to add products.';
            this.showToast('Error', msg, 'error');
            console.error('createOrderItems error:', JSON.stringify(error));

        } finally {
            this.isSaving = false;
        }
    }

    // ── Toast helper ──────────────────────────────────────────────────────────
    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}