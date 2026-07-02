import { LightningElement, wire, track } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';
import getAvailableDocs from '@salesforce/apex/DealerDocumentUploaderController.getAvailableDocs';
import updateCheckbox from '@salesforce/apex/DealerDocumentUploaderController.updateCheckbox';
import saveKYCData from '@salesforce/apex/DealerDocumentUploaderController.saveKYCData';
import uploadFileToSalesforce from '@salesforce/apex/DealerDocumentUploaderController.uploadFileToSalesforce';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

// 🔥 FRACTO CONFIG
const FRACTO_URL = 'https://prod-ml.fracto.tech/upload-file-smart-ocr';
const API_KEY = 'KLO-TUS-A76C08-GPF1BO-7008MEKJ'; // ⚠️ secure later
const PARSER_APP = 'MNXASQzLS7XQXOK6';
const MODEL = 'v1';
const EXTRA_ACC = 'false';

export default class AccountDocUploader extends LightningElement {

    accountId;

    @track selectedDoc;
    @track availableOptions = [];
    @track isProcessing = false;

    selectedFile = null;
    selectedFileName = '';

    // =========================
    // GET RECORD ID
    // =========================
    @wire(CurrentPageReference)
    getStateParameters(currentPageReference) {
        if (currentPageReference) {
            this.accountId =
                currentPageReference.attributes?.recordId ||
                currentPageReference.state?.recordId;
        }
    }

    // =========================
    // GET DOC OPTIONS
    // =========================
    @wire(getAvailableDocs, { accountId: '$accountId' })
    wiredOptions({ data, error }) {
        if (data) {
            this.availableOptions = data;
        } else if (error) {
            this.showToast('Error', 'Unable to load document options', 'error');
        }
    }

    openFileDialog() {
        const input = this.template.querySelector('input[type="file"]');
        if (input) input.click();
    }

    // =========================
    // UI GETTERS
    // =========================
    get uploadDisabled() {
        return !this.selectedFile || !this.selectedDoc || this.isProcessing;
    }

    // =========================
    // HANDLE DOC TYPE
    // =========================
    handleDocChange(event) {
        this.selectedDoc = event.detail.value;
    }

    // =========================
    // HANDLE FILE SELECT
    // =========================
    handleFileChange(event) {
        const files = event.target.files;

        if (files && files.length > 0) {
            this.selectedFile = files[0];
            this.selectedFileName = files[0].name;
        }
    }

    // =========================
    // CLEAR FILE
    // =========================
    clearFile() {
        this.selectedFile = null;
        this.selectedFileName = '';

        const input = this.template.querySelector('input[type="file"]');
        if (input) input.value = '';
    }

    // =========================
    // MAIN PROCESS FLOW
    // =========================
    async handleSubmit() {

        if (!this.accountId || !this.selectedDoc || !this.selectedFile) {
            this.showToast('Error', 'Missing data', 'error');
            return;
        }

        this.isProcessing = true;

        try {

            // 🔥 Convert file → base64 (ONLY for Salesforce upload)
            const base64 = await this.convertToBase64(this.selectedFile);

            // 🔥 Upload file to Salesforce
            await uploadFileToSalesforce({
                recordId: this.accountId,
                fileName: this.selectedFile.name,
                base64Data: base64
            });

            let kyc = {};

            if (
                this.selectedDoc === 'PAN_Card__c' ||
                this.selectedDoc === 'Aadhaar_Card__c' ||
                this.selectedDoc === 'GST_Certificate__c'
            ) {
                const response = await this.callFractoAPI(this.selectedFile);
                kyc = this.extractKYCFields(response);
                console.log('Response',JSON.stringify(response));
                console.log('KYC',JSON.stringify(kyc));
                // 🔹 Save OCR data ONLY if relevant
                await saveKYCData({
                    accountId: this.accountId,
                    pan: kyc.pan,
                    aadhaar: kyc.aadhaar,
                    gst: kyc.gst
                });
            }

            // 🔥 Update checkbox
            await updateCheckbox({
                accountId: this.accountId,
                fieldName: this.selectedDoc
            });

            this.showToast('Success', 'Document uploaded & processed', 'success');

            this.clearFile();

        } catch (error) {
            console.error(error);
            this.showToast('Error', error.message || 'Processing failed', 'error');
        }

        this.isProcessing = false;
    }

    convertToBase64(file) {
        return new Promise((resolve, reject) => {

            const reader = new FileReader();

            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };

            reader.onerror = error => reject(error);

            reader.readAsDataURL(file);
        });
    }
    // =========================
    // FRACTO API CALL
    // =========================
    async callFractoAPI(file) {

        const formData = new FormData();
        formData.append('file', file, file.name);
        formData.append('parserApp', PARSER_APP);
        formData.append('model', MODEL);
        formData.append('extra_accuracy', EXTRA_ACC);

        const response = await fetch(FRACTO_URL, {
            method: 'POST',
            headers: {
                'x-api-key': API_KEY
            },
            body: formData
        });

        const text = await response.text();

        if (!response.ok) {
            throw new Error(`Fracto error (${response.status}): ${text}`);
        }

        return JSON.parse(text);
    }

    // =========================
    // EXTRACT PAN / AADHAAR
    // =========================
    extractKYCFields(resMap) {

    let pan = null;
    let aadhaar = null;
    let gst = null;

    // 🔹 PAN
    pan =
        resMap?.others?.pan_number ||
        resMap?.pan__number ||
        resMap?.pan_number ||
        resMap?.parsedData?.pan_number ||
        resMap?.parsedData?.["PAN Number"] ||
        null;

    // 🔹 Aadhaar
    aadhaar =
        resMap?.aadhaar_number ||
        resMap?.others?.aadhaar_number ||
        resMap?.parsedData?.aadhaar_number ||
        resMap?.parsedData?.["Aadhaar Number"] ||
        null;

    // 🔥 GST (FIXED)
    gst =
        resMap?.registration_number ||
        resMap?.parsedData?.registration_number ||
        resMap?.parsedData?.["Registration Number"] ||
        null;

    console.log('OCR RAW RESPONSE:', JSON.stringify(resMap));
    console.log('Extracted → PAN:', pan, 'AADHAAR:', aadhaar, 'GST:', gst);

    return { pan, aadhaar, gst };
}
    // =========================
    // TOAST
    // =========================
    showToast(title, message, variant) {
        this.dispatchEvent(
            new ShowToastEvent({ title, message, variant })
        );
    }
}