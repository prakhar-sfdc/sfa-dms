import { LightningElement, wire, track } from 'lwc';
import getDealers from '@salesforce/apex/DealerManagementController.getDealers';
import createDealer from '@salesforce/apex/DealerManagementController.createDealer';
import getDealerDetail from '@salesforce/apex/DealerManagementController.getDealerDetail';
import updateDealerDocumentFlag from '@salesforce/apex/DealerManagementController.updateDealerDocumentFlag';
import updateDealer from '@salesforce/apex/DealerManagementController.updateDealer';
import getDealerFieldSet from '@salesforce/apex/DealerManagementController.getDealerFieldSet';
import getUsers from '@salesforce/apex/DealerManagementController.getUsers';

import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class DealerManagement extends LightningElement {

    @track userOptions = [];
    @track fieldSetFields = [];
    @track dealers = [];
    @track showCreateModal = false;
    @track showListView = true;
    @track showDetailView = false;
    @track selectedDealer;
    @track activeTab = 'details';
    @track selectedDocumentType;
    @track selectedFile;
    @track showUploadModal = false;
    @track isEditMode = false;
    @track editingDealerId;
    @track formData = {};

    @wire(getUsers)
    wiredUsers({ data }) {
        if (data) {
            this.userOptions = data.map(u => ({
                label: u.Name,
                value: u.Id
            }));
        }
    }

    @wire(getDealerFieldSet)
    wiredFieldSet({ data }) {
        if (data) {

            this.fieldSetFields = data.map(field => {

                const val = this.formData[field.fieldPath];

                const isLookupUser = field.fieldPath === 'Onboarded_By__c';

                return {
                    ...field,
                    value: val ?? '',
                    checked: val ?? false,

                    // ✅ FLAGS (NO HTML LOGIC NEEDED)
                    isLookupUser: isLookupUser,
                    isText:
                        !field.isPicklist &&
                        !field.isBoolean &&
                        !field.isDate &&
                        !field.isNumber &&
                        !isLookupUser
                };
            });

        }
    }
    dealerTypeOptions = [
        { label: 'Retail', value: 'Retail' },
        { label: 'Distributor', value: 'Distributor' },
        { label: 'Sub Dealer', value: 'Sub Dealer' }
    ];

    territoryOptions = [
        { label: 'North', value: 'North' },
        { label: 'South', value: 'South' },
        { label: 'East', value: 'East' },
        { label: 'West', value: 'West' }
    ];

    paymentOptions = [
        { label: 'Advance', value: 'Advance' },
        { label: '15 Days', value: '15 Days' },
        { label: '30 Days', value: '30 Days' },
        { label: '45 Days', value: '45 Days' }
    ];

    statusOptions = [
        { label: 'Active', value: 'Active' },
        { label: 'Inactive', value: 'Inactive' },
        { label: 'Suspended', value: 'Suspended' }
    ];

    getFieldValue(record, fieldPath) {
        if (!record) return '';

        // 🔥 handle relationship fields
        if (fieldPath.includes('.')) {
            return fieldPath.split('.').reduce((obj, key) => obj?.[key], record);
        }

        return record[fieldPath];
    }

    @wire(getDealers)
    wiredDealers({ data, error }) {
        if (data) {

            this.dealers = data.map(d => ({
                ...d,

                fullName: `${d.FirstName || ''} ${d.LastName || ''}`.trim(),

                formattedCredit: new Intl.NumberFormat('en-IN', {
                    style: 'currency',
                    currency: 'INR'
                }).format(d.Credit_Limit__c || 0),

                statusClass: this.getStatusClass(d.Dealer_Status__c)
            }));

        } else if (error) {
            console.error('Error fetching dealers:', error);
        }
    }

    openCreateDealer() {
        this.showCreateModal = true;
    }

    closeModal() {
        this.showCreateModal = false;
    }

    handleChange(event) {
        const field = event.target.name;
        this.formData[field] = event.detail.value;
    }

    handleDynamicChange(event) {

        const field = event.target.name;

        let value;

        if (event.target.type === 'checkbox') {
            value = event.target.checked;
        } else {
            value = event.target.value;
        }

        // update formData
        this.formData = {
            ...this.formData,
            [field]: value
        };

        // 🔥 ALSO update fieldSetFields (IMPORTANT)
        this.fieldSetFields = this.fieldSetFields.map(f => {
            if (f.fieldPath === field) {
                return {
                    ...f,
                    value: value,
                    checked: value
                };
            }
            return f;
        });
    }

    get isEmpty() {
        return this.dealers.length === 0;
    }

    getStatusClass(status) {

        if (!status) return 'status neutral';

        status = status.toLowerCase();

        if (status === 'active') return 'status positive';
        if (status === 'inactive') return 'status negative';
        // if (status === 'susp') return 'status warning';
        if (status === 'suspended') return 'status negative';

        return 'status neutral';
    }

    handleCreateDealer() {

        if (this.isEditMode) {

            updateDealer({
                dealerId: this.editingDealerId,
                dealerData: JSON.stringify(this.formData)
            })
                .then(() => {

                    this.showToast('Success', 'Dealer updated successfully', 'success');

                    this.showCreateModal = false;
                    this.isEditMode = false;

                    // 🔥 refresh detail view
                    this.viewDealer({
                        currentTarget: { dataset: { id: this.editingDealerId } },
                        preventDefault: () => { }
                    });

                })
                .catch(error => {
                    this.showToast('Error', error.body.message, 'error');
                });

        } else {

            // 🔥 existing CREATE logic (unchanged)
            createDealer({
                dealerData: JSON.stringify(this.formData)
            })
                .then(() => {

                    this.showToast('Success', 'Dealer created successfully', 'success');
                    this.showCreateModal = false;

                })
                .catch(error => {
                    this.showToast('Error', error.body.message, 'error');
                });

        }
    }
    viewDealer(event) {
        event.preventDefault();
        const dealerId = event.currentTarget.dataset.id;

        getDealerDetail({ dealerId: dealerId })
            .then(result => {

                this.selectedDealer = {
                    ...result,
                    Name: `${result.FirstName || ''} ${result.LastName || ''}`.trim(),
                    formattedCredit: new Intl.NumberFormat('en-IN', {
                        style: 'currency',
                        currency: 'INR'
                    }).format(result.Credit_Limit__c || 0),

                    // DOCUMENT STATUS
                    gstStatus: result.GST_Certificate__c ? 'Uploaded' : 'Pending',
                    gstStatusClass: result.GST_Certificate__c ? 'status positive' : 'status negative',

                    panStatus: result.PAN_Card__c ? 'Uploaded' : 'Pending',
                    panStatusClass: result.PAN_Card__c ? 'status positive' : 'status negative',

                    aadhaarStatus: result.Aadhaar_Card__c ? 'Uploaded' : 'Pending',
                    aadhaarStatusClass: result.Aadhaar_Card__c ? 'status positive' : 'status negative',

                    bankStatus: result.Bank_Proof__c ? 'Uploaded' : 'Pending',
                    bankStatusClass: result.Bank_Proof__c ? 'status positive' : 'status negative',

                    businessStatus: result.Business_Registration__c ? 'Uploaded' : 'Pending',
                    businessStatusClass: result.Business_Registration__c ? 'status positive' : 'status negative',

                    addressStatus: result.Address_Proof__c ? 'Uploaded' : 'Pending',
                    addressStatusClass: result.Address_Proof__c ? 'status positive' : 'status negative'
                };
                this.fieldSetFields = this.fieldSetFields.map(f => {

                    let val;

                    // ✅ HANDLE RELATIONSHIP FIELD
                    if (f.fieldPath.includes('.')) {
                        val = f.fieldPath.split('.').reduce((obj, key) => obj?.[key], result);
                    } else {
                        if (f.fieldPath === 'Onboarded_By__c') {
                            val = result.Onboarded_By__r?.Name;
                        }
                        else if (f.fieldPath.includes('.')) {
                            val = f.fieldPath.split('.').reduce((obj, key) => obj?.[key], result);
                        } else {
                            val = result[f.fieldPath];
                        }
                    }

                    return {
                        ...f,
                        displayValue: val ?? ''
                    };
                });

                this.showListView = false;
                this.showDetailView = true;

            })
            .catch(error => {
                console.error(error);
            });
    }


    backToList() {
        this.showDetailView = false;
        this.showListView = true;
        this.selectedDealer = null;
    }

    get isDetailsTab() {
        return this.activeTab === 'details';
    }

    get detailTabClass() {
        return this.activeTab === 'details' ? 'tab-btn active' : 'tab-btn';
    }

    get ordersTabClass() {
        return this.activeTab === 'orders' ? 'tab-btn active' : 'tab-btn';
    }

    showDetailTab() {
        this.activeTab = 'details';
    }

    get pendingDocumentOptions() {
        if (!this.selectedDealer) return [];

        let options = [];

        if (!this.selectedDealer.GST_Certificate__c)
            options.push({ label: 'GST Certificate', value: 'GST_Certificate__c' });

        if (!this.selectedDealer.PAN_Card__c)
            options.push({ label: 'PAN Card', value: 'PAN_Card__c' });

        if (!this.selectedDealer.Aadhaar_Card__c)
            options.push({ label: 'Aadhaar Card', value: 'Aadhaar_Card__c' });

        if (!this.selectedDealer.Bank_Proof__c)
            options.push({ label: 'Bank Proof', value: 'Bank_Proof__c' });

        if (!this.selectedDealer.Business_Registration__c)
            options.push({ label: 'Business Registration', value: 'Business_Registration__c' });

        if (!this.selectedDealer.Address_Proof__c)
            options.push({ label: 'Address Proof', value: 'Address_Proof__c' });

        return options;
    }
    handleDocumentTypeChange(event) {
        this.selectedDocumentType = event.detail.value;
    }


    openUploadModal() {
        this.showUploadModal = true;
    }

    closeUploadModal() {
        this.showUploadModal = false;
        this.selectedDocumentType = null;
    }

    handleUploadFinished() {

        if (!this.selectedDocumentType) {
            this.showToast('Error', 'Please select document type', 'error');
            return;
        }

        updateDealerDocumentFlag({
            dealerId: this.selectedDealer.Id,
            documentField: this.selectedDocumentType
        })
            .then(() => {

                this.showToast('Success', 'Document uploaded successfully', 'success');

                this.closeUploadModal();

                // 🔥 refresh dealer
                this.viewDealer({
                    currentTarget: { dataset: { id: this.selectedDealer.Id } },
                    preventDefault: () => { }
                });

            })
            .catch(error => {
                this.showToast('Error', error.body.message, 'error');
            });
    }

    showToast(title, message, variant) {
        this.dispatchEvent(
            new ShowToastEvent({
                title: title,
                message: message,
                variant: variant
            })
        );
    }

    get modalTitle() {
        return this.isEditMode ? 'Edit Dealer' : 'Create Dealer';
    }
    get modalButtonLabel() {
        return this.isEditMode ? 'Save Changes' : 'Create Dealer';
    }

    openEditDealer() {

        this.isEditMode = true;
        this.showCreateModal = true;
        this.editingDealerId = this.selectedDealer.Id;
        console.log('prefilled data', this.formData)

        this.formData = {};

        this.fieldSetFields.forEach(field => {

            let val;

            if (field.fieldPath.includes('.')) {
                val = field.fieldPath.split('.').reduce((obj, key) => obj?.[key], this.selectedDealer);
            } else {
                val = this.selectedDealer[field.fieldPath];
            }

            this.formData[field.fieldPath] = val ?? '';
        });

        if (this.selectedDealer.FirstName || this.selectedDealer.LastName) {
            this.formData.FirstName = this.selectedDealer.FirstName;
            this.formData.LastName = this.selectedDealer.LastName;
        }

        // 🔥 IMPORTANT: sync field values
        this.fieldSetFields = this.fieldSetFields.map(f => {
            let val;

            if (f.fieldPath.includes('.')) {
                val = f.fieldPath.split('.').reduce((obj, key) => obj?.[key], this.selectedDealer);
            } else {
                val = this.selectedDealer[f.fieldPath];
            }

            return {
                ...f,
                value: val ?? '',
                checked: val ?? false
            };
        });
    }
}