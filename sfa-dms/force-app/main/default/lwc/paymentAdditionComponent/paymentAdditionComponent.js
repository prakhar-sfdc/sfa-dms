import { LightningElement, api, track, wire } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import { CloseActionScreenEvent } from 'lightning/actions';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import createPayment from '@salesforce/apex/PaymentQuickActionController.createPayment';
import uploadReceipt from '@salesforce/apex/PaymentQuickActionController.uploadReceipt';

import ORDER_NUMBER_FIELD from '@salesforce/schema/Order.OrderNumber';
import ACCOUNT_ID_FIELD from '@salesforce/schema/Order.AccountId';
import ACCOUNT_NAME_FIELD from '@salesforce/schema/Order.Account.Name';

// ── Fracto OCR config ────────────────────────────────────────────────────────
const FRACTO_URL = 'https://prod-ml.fracto.tech/upload-file-smart-ocr';
const API_KEY = 'KLO-TUS-A76C08-GPF1BO-7008MEKJ'; // ⚠️ secure later
const PARSER_APP = 'MNXASQzLS7XQXOK6';
const MODEL = 'v1';
const EXTRA_ACC = 'false';

export default class PaymentQuickAction extends LightningElement {

    @api recordId; // Order Id — injected by quick action

    // ── Wire ─────────────────────────────────────────────────────────────────
    @wire(getRecord, {
        recordId: '$recordId',
        fields: [ORDER_NUMBER_FIELD, ACCOUNT_ID_FIELD, ACCOUNT_NAME_FIELD]
    })
    wiredOrder({ data, error }) {
        if (data) {
            this.orderNumber = getFieldValue(data, ORDER_NUMBER_FIELD);
            this.accountId = getFieldValue(data, ACCOUNT_ID_FIELD);
            this.accountName = getFieldValue(data, ACCOUNT_NAME_FIELD);
            this.isLoading = false;
        } else if (error) {
            this.showToast('Error', 'Could not load order details', 'error');
            this.isLoading = false;
        }
    }

    // ── State ─────────────────────────────────────────────────────────────────
    @track isLoading = true;
    @track isOCRProcessing = false;
    @track isSaving = false;
    @track showStep1 = true;
    @track showStep2 = false;
    @track ocrDone = false;
    @track ocrError = false;

    orderNumber = '';
    accountId = '';
    accountName = '';

    // Only user-entered field
    @track selectedMode = '';

    // All populated by OCR
    paymentAmount = '';
    referenceNumber = '';
    bankName = '';
    paymentDate = '';

    // File
    selectedFile = null;
    selectedFileName = '';

    // ── Payment mode tiles ────────────────────────────────────────────────────
    get paymentModes() {
        return [
            { value: 'Cash', label: 'Cash', icon: '💵' },
            { value: 'Bank Transfer', label: 'Bank Transfer', icon: '🏦' },
            { value: 'Cheque', label: 'Cheque', icon: '📝' },
            { value: 'UPI', label: 'UPI', icon: '📱' },
            { value: 'Card', label: 'Card', icon: '💳' }
        ].map(m => ({
            ...m,
            btnClass: m.value === this.selectedMode
                ? 'mode-btn mode-btn--active'
                : 'mode-btn'
        }));
    }

    // Step 1 is valid when mode selected AND file uploaded AND OCR has run
    get step1Invalid() {
        return !this.selectedMode || !this.selectedFile || !this.ocrDone;
    }

    // ── Mode selection ────────────────────────────────────────────────────────
    handleModeSelect(event) {
        this.selectedMode = event.currentTarget.dataset.value;
    }

    // ── File handling ─────────────────────────────────────────────────────────
    openFileDialog() {
        this.template.querySelector('input[type="file"]').click();
    }

    handleFileChange(event) {
        const files = event.target.files;
        if (files && files.length > 0) {
            this.selectedFile = files[0];
            this.selectedFileName = files[0].name;
            this.ocrDone = false;
            this.ocrError = false;
            // Auto-trigger OCR as soon as file is chosen
            this.runOCR();
        }
    }

    clearFile(event) {
        event.stopPropagation();
        this.selectedFile = null;
        this.selectedFileName = '';
        this.ocrDone = false;
        this.ocrError = false;
        this.paymentAmount = '';
        this.referenceNumber = '';
        this.bankName = '';
        this.paymentDate = '';
        const input = this.template.querySelector('input[type="file"]');
        if (input) input.value = '';
    }

    // ── OCR — auto-triggered on file select ───────────────────────────────────
    async runOCR() {
        this.isOCRProcessing = true;
        this.ocrDone = false;
        this.ocrError = false;

        try {
            const formData = new FormData();
            formData.append('file', this.selectedFile, this.selectedFile.name);
            formData.append('parserApp', PARSER_APP);
            formData.append('model', MODEL);
            formData.append('extra_accuracy', EXTRA_ACC);

            const response = await fetch(FRACTO_URL, {
                method: 'POST',
                headers: { 'x-api-key': API_KEY },
                body: formData
            });

            if (!response.ok) throw new Error(`OCR error: ${response.status}`);

            const resMap = await response.json();
            console.log('OCR Raw:', JSON.stringify(resMap));

            this.extractPaymentFields(resMap);
            this.ocrDone = true;

        } catch (err) {
            console.error(err);
            this.ocrError = true;
        }

        this.isOCRProcessing = false;
    }

    extractPaymentFields(resMap) {
        const parsed = resMap?.parsedData;

        // ✅ Handle both structures — flat and nested under payment_receipt
        const data = parsed?.payment_receipt || parsed;

        // ── Amount ──────────────────────────────────────────
        const amount =
            data?.amount?.value ||
            data?.amount ||
            null;
        if (amount) this.paymentAmount = String(amount).replace(/[^0-9.]/g, '');

        // ── Reference / UPI Ref ─────────────────────────────
        const ref =
            data?.upi_ref_id ||
            data?.reference_number ||
            data?.['Reference Number'] ||
            data?.['Transaction ID'] ||
            null;
        if (ref) this.referenceNumber = ref;

        // ── Bank Name ───────────────────────────────────────
        const bank =
            data?.from?.bank ||
            data?.to?.bank ||
            data?.bank_name ||
            null;
        if (bank) this.bankName = bank;

        // ── Payment Date — now split across date + time ─────
        const datePart = data?.date_time || data?.date || null;  // "30 Jun" or "30 Jun, 01:14 PM"
        const timePart = data?.time || '';                        // "01:14 PM"

        if (datePart) {
            try {
                // Combine "30 Jun" + "01:14 PM" + current year into parseable string
                const combined = `${datePart} ${timePart} ${new Date().getFullYear()}`.trim();
                const d = new Date(combined);
                if (!isNaN(d)) {
                    this.paymentDate = d.toISOString().slice(0, 10);
                }
            } catch (e) { /* leave blank */ }
        }

        // ── Auto-select Payment Mode ────────────────────────
        const poweredBy = data?.powered_by?.toLowerCase() || '';
        const platform = data?.platform?.toLowerCase() || '';

        if (!this.selectedMode) {
            if (poweredBy === 'upi' || data?.upi_ref_id) {
                this.selectedMode = 'UPI';
            } else if (platform.includes('neft') || platform.includes('imps') || platform.includes('rtgs')) {
                this.selectedMode = 'Bank Transfer';
            } else if (platform.includes('cheque')) {
                this.selectedMode = 'Cheque';
            }
        }
    }

    // ── Navigation ────────────────────────────────────────────────────────────
    goToStep2() {
        this.showStep1 = false;
        this.showStep2 = true;
    }

    goBack() {
        this.showStep2 = false;
        this.showStep1 = true;
    }

    // ── Save ──────────────────────────────────────────────────────────────────
    async handleSubmit() {
        this.isSaving = true;

        try {
            const paymentId = await createPayment({
                orderId: this.recordId,
                accountId: this.accountId,
                amount: this.paymentAmount ? parseFloat(this.paymentAmount) : null,
                paymentMode: this.selectedMode,
                referenceNumber: this.referenceNumber || '',
                bankName: this.bankName || '',
                paymentDate: this.paymentDate || ''
            });

            const base64 = await this.convertToBase64(this.selectedFile);
            await uploadReceipt({
                paymentId: paymentId,
                fileName: this.selectedFile.name,
                base64Data: base64
            });

            this.showToast('Success', 'Payment recorded successfully!', 'success');
            this.dispatchEvent(new CloseActionScreenEvent());

        } catch (err) {
            console.error(err);
            this.showToast('Error', err.body?.message || err.message || 'Save failed', 'error');
        }

        this.isSaving = false;
    }

    convertToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = err => reject(err);
            reader.readAsDataURL(file);
        });
    }

    handleCancel() {
        this.dispatchEvent(new CloseActionScreenEvent());
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}