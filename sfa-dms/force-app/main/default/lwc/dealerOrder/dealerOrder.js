import { LightningElement, wire, track, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import USER_ID from '@salesforce/user/Id';
import getOrders from '@salesforce/apex/DealerOrdersController.getOrders';
import getPricebooks from '@salesforce/apex/DealerOrdersController.getPricebooks';
import getAccounts from '@salesforce/apex/DealerOrdersController.getAccounts';
import getDealerAccounts from '@salesforce/apex/DealerOrdersController.getDealerContacts';
import createOrder from '@salesforce/apex/DealerOrdersController.createOrder';
import getOrderDetail from '@salesforce/apex/DealerOrdersController.getOrderDetail';
import getOrderItems from '@salesforce/apex/DealerOrdersController.getOrderItems';
import getActiveProductsForPricebook from '@salesforce/apex/DealerOrdersController.getActiveProductsForPricebook';
import createOrderItems from '@salesforce/apex/DealerOrdersController.createOrderItems';
import getOrderFieldSet from '@salesforce/apex/DealerOrdersController.getOrderFieldSet';
import getLoggedInUserAccount from '@salesforce/apex/DealerOrdersController.getLoggedInUserAccount';

export default class DealerOrders extends LightningElement {
    // Record type Ids (provided)
    PRIMARY_RT = '012dL00000CFuarQAD';
    SECONDARY_RT = '012dL00000CFucTQAT';
    _openedFromDashboard = false;
    @api selectedOrderId;
    @track orders = [];
    @track showOrderTypeModal = false;
    @track showCreateModal = false;
    @track showListView = true;
    @track showDetailView = false;
    @track selectedOrder;
    @track accountOptions = [];
    @track pricebookOptions = [];
    @track contactOptions = [];
    @track productsUI = [];
    @track orderFields = [];
    @track detailFields = [];

    @track stages = [
        { label: 'Draft', value: 'Draft' },
        { label: 'Pending', value: 'Pending' },
        { label: 'Approved', value: 'Approved' },
        { label: 'Shipped', value: 'Shipped' },
        { label: 'Delivered', value: 'Delivered' }
    ];

    @track selectedStage;

    get computedStages() {
    return this.stages.map(stage => {

        let className = 'stage';

        if (stage.value === this.currentStage) {
            className += ' current';
        } 
        else if (this.isStageCompleted(stage.value)) {
            className += ' completed';
        }

        if (stage.value === this.selectedStage) {
            className += ' selected';
        }

        return {
            ...stage,
            class: className
        };
    });
}

isStageCompleted(stageValue) {
    const order = this.stages.map(s => s.value);
    return order.indexOf(stageValue) < order.indexOf(this.currentStage);
}
    handleStageClick(event) {
    this.selectedStage = event.currentTarget.dataset.value;
}
    // Order type selection
    @track orderType = null; // 'primary' or 'secondary'
    get isPrimaryOrder() {
        return this.orderType === 'primary';
    }
    get isSecondaryOrder() {
        return this.orderType === 'secondary';
    }
    get orderTypeLabel() {
        return this.isPrimaryOrder ? 'Primary' : 'Secondary';
    }

    // Current user Id
    currentUserId = USER_ID;

    // Tabs
    @track activeTab = 'details';

    // Order Items
    @track orderItems = [];

    // Add Product Modal
    @track showAddProductModal = false;
    @track addProductStep = 1; // 1 = select, 2 = quantity
    @track availableProductsOptions = [];
    @track availableProductsMap = {};
    @track selectedProductEntries = [];
    @track selectedProductsWithQuantity = [];

    @wire(getOrderFieldSet)
    wiredFields({ data, error }) {
        if (data) {

            this.orderFields = data.map(field => {

    let value = this.formData[field.fieldPath] || '';

    const isTypeField = field.fieldPath === 'Type';

    return {
        ...field,
        value: value,

        // 🔥 FORCE PICKLIST FOR TYPE
        isPicklist: field.isPicklist || isTypeField,

        // optional: custom options
        options: isTypeField ? this.typeOptions : field.options,

        isDealerFieldHidden: field.fieldPath === 'Tagged_to__c'
            ? this.orderType !== 'secondary'
            : false
    };
});

        } else if (error) {
            console.error(error);
        }
    }
    connectedCallback() {
        getLoggedInUserAccount()
            .then(accId => {
                this.formData = {
                    ...this.formData,
                    AccountId: accId
                };
            })
            .catch(err => console.error(err));
    }

    handleDynamicChange(event) {
        const field = event.target.name;
        const value = event.detail.value;

        // update form data
        this.formData = {
            ...this.formData,
            [field]: value
        };

        // 🔥 update UI values ALSO
        this.orderFields = this.orderFields.map(f => {
            if (f.fieldPath === field) {
                return { ...f, value: value };
            }
            return f;
        });
    }

    // Form data for create order (extended)
    formData = {
        name: '',
        effectiveDate: '',
        endDate: '',
        status: '',
        type: '',
        poNumber: '',
        poDate: '',
        billToContactId: '',
        shipToContactId: '',
        shippingAddress: '',
        billingAddress: '',
        estimatedDeliveryDate: '',
        taggedToId: ''
    };
    @track errors = {};

    @track selectedStage;
@track currentStage;
    @track stages = [
    { label: 'Draft', value: 'Draft' },
    { label: 'Pending', value: 'Pending' },
    { label: 'Activated', value: 'Activated' },
    { label: 'Delivered', value: 'Delivered' }
];

    typeOptions = [
    { label: 'Standard', value: 'Standard' },
    { label: 'Replacement', value: 'Replacement' },
    { label: 'Sample', value: 'Sample' }
];

    renderedCallback() {
        if (this.selectedOrderId && !this._openedFromDashboard) {
            this._openedFromDashboard = true;

            this.openOrderFromDashboard(this.selectedOrderId);
        }
    }
    // Getters for tab activation
    get isDetailsActive() {
        return this.activeTab === 'details';
    }
    get isProductsActive() {
        return this.activeTab === 'products';
    }

    // Getters for modal step
    get isStepOne() {
        return this.addProductStep === 1;
    }
    get isStepTwo() {
        return this.addProductStep === 2;
    }
    get modalHeaderTitle() {
        return this.isStepOne ? 'Select Products' : 'Set Quantities';
    }
    get cancelButtonLabel() {
        return this.isStepOne ? 'Cancel' : 'Back';
    }
    get nextButtonLabel() {
        return this.isStepOne ? 'Next' : 'Done';
    }

    // Getters for error display in create modal
    get errorAccountId() {
        return this.errors.accountId;
    }
    get errorPricebookId() {
        return this.errors.pricebook2Id;
    }
    get errorEffectiveDate() {
        return this.errors.effectiveDate;
    }
    get errorStatus() {
        return this.errors.status;
    }
    get errorTaggedToId() {
        return this.errors.taggedToId;
    }

    // Tab class getters
    get detailTabClass() {
        return 'tab-btn ' + (this.isDetailsActive ? 'active' : '');
    }
    get productsTabClass() {
        return 'tab-btn ' + (this.isProductsActive ? 'active' : '');
    }

    // Order items empty check
    get orderItemsEmpty() {
        return this.orderItems.length === 0;
    }

    // Wire orders
    @wire(getOrders)
    wiredOrders(result) {
        this.wiredOrdersResult = result;
        const { data, error } = result;
        if (data) {
            this.orders = data.map(order => ({
                ...order,
                formattedDate: new Date(order.EffectiveDate).toLocaleDateString('en-US'),
                formattedAmount: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(order.TotalAmount || 0),
                statusClass: `status status-${order.Status ? order.Status.toLowerCase() : 'unknown'}`,
                deliveryStatus: this.calculateDeliveryStatus(order.Estimated_Delivery_Date__c),
                deliveryClass: `status ${this.getDeliveryClass(order.Estimated_Delivery_Date__c)}`,
                recordTypeName: order.RecordType?.Name,
                recordTypeClass: `status recordtype-${(order.RecordType?.Name != '') ? order.RecordType?.Name?.toLowerCase() : 'Primary'}`
            }));
        }
        if (error) console.error('Error loading orders:', error);
    }

    @wire(getAccounts)
    wiredAccounts({ data, error }) {
        if (data) this.accountOptions = data.map(acc => ({ label: acc.Name, value: acc.Id }));
        if (error) console.error(error);
    }

    @wire(getPricebooks)
    wiredPricebooks({ data, error }) {
        if (data) this.pricebookOptions = data.map(pb => ({ label: pb.Name, value: pb.Id }));
        if (error) console.error(error);
    }

    @wire(getDealerAccounts)
    wiredContacts({ data, error }) {
        if (data) this.contactOptions = data.map(con => ({ label: con.Name, value: con.Id }));
        if (error) console.error(error);
    }

    // Helper methods for delivery status (used in list view)
    calculateDeliveryStatus(estimatedDate) {
        if (!estimatedDate) return 'Not Set';
        const today = new Date();
        const est = new Date(estimatedDate);
        const diffDays = Math.ceil((est - today) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) return 'Overdue';
        if (diffDays === 0) return 'Today';
        if (diffDays <= 3) return 'Urgent';
        return 'On Track';
    }

    getDeliveryClass(estimatedDate) {
        if (!estimatedDate) return 'neutral';
        const today = new Date();
        const est = new Date(estimatedDate);
        const diffDays = Math.ceil((est - today) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) return 'negative';
        if (diffDays <= 3) return 'warning';
        return 'positive';
    }

    // Format address helper
    formatAddress(street, city, state, postalCode, country) {
        const parts = [];
        if (street) parts.push(street);
        if (city) parts.push(city);
        if (state) parts.push(state);
        if (postalCode) parts.push(postalCode);
        if (country) parts.push(country);
        return parts.length > 0 ? parts.join(', ') : 'Not provided';
    }

    processOrderDetail(result) {

        this.currentStage = result.Status;
        this.selectedStage = result.Status;
        const created = result.CreatedDate ? new Date(result.CreatedDate) : null;
        const due = result.Estimated_Delivery_Date__c ? new Date(result.Estimated_Delivery_Date__c) : null;

        let tat = {};

        if (created && due) {
            const today = new Date();
            const totalDuration = due - created;
            const elapsedDuration = today - created;

            const remainingDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));

            let completion = (elapsedDuration / totalDuration) * 100;
            completion = Math.max(0, Math.min(completion, 100));
            const completionRounded = Math.round(completion);

            const progress = completion / 100;
            const dashOffset = 534 - (534 * progress);

            let ringClass, statusText, displayDays;

            if (remainingDays > 5) {
                ringClass = 'tat-safe-ring';
                statusText = 'Days Remaining';
                displayDays = remainingDays;
            } else if (remainingDays > 2) {
                ringClass = 'tat-warning-ring';
                statusText = 'Days Remaining';
                displayDays = remainingDays;
            } else if (remainingDays >= 0) {
                ringClass = 'tat-critical-ring';
                statusText = 'Days Remaining';
                displayDays = remainingDays;
            } else {
                ringClass = 'tat-overdue-ring';
                statusText = 'Days Overdue';
                displayDays = Math.abs(remainingDays);
            }

            const barWidth = completionRounded;
            const progressBarStyle = `width: ${barWidth}%`;
            const progressDotStyle = `left: ${barWidth}%`;

            tat = {
                tatRingClass: ringClass,
                tatDashOffset: dashOffset,
                tatDisplayDays: displayDays,
                tatStatusText: statusText,
                tatProgressBarStyle: progressBarStyle,
                tatProgressDotStyle: progressDotStyle,
                formattedCreatedDate: created.toLocaleDateString('en-US')
            };
        }

        const billingAddress = this.formatAddress(
            result.BillingStreet,
            result.BillingCity,
            result.BillingState,
            result.BillingPostalCode,
            result.BillingCountry
        );

        const shippingAddress = this.formatAddress(
            result.ShippingStreet,
            result.ShippingCity,
            result.ShippingState,
            result.ShippingPostalCode,
            result.ShippingCountry
        );

        this.selectedOrder = {
            ...result,
            ...tat,
            formattedEffectiveDate: result.EffectiveDate ? new Date(result.EffectiveDate).toLocaleDateString('en-US') : '',
            formattedEndDate: result.EndDate ? new Date(result.EndDate).toLocaleDateString('en-US') : '',
            formattedTotalAmount: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(result.TotalAmount || 0),
            formattedEstimatedDelivery: due ? due.toLocaleDateString('en-US') : 'Not Set',
            statusClassDetail: `status status-${result.Status ? result.Status.toLowerCase() : 'unknown'}`,
            formattedBillingAddress: billingAddress,
            formattedShippingAddress: shippingAddress
        };

        this.prepareDetailFields();
        this.showListView = false;
        this.showDetailView = true;
        this.activeTab = 'details';
        this.orderItems = [];
    }

    openOrderFromDashboard(orderId) {
        getOrderDetail({ orderId: orderId })
            .then(result => {
                this.processOrderDetail(result);
            })
            .catch(error => {
                console.error(error);
            });
    }

    // View order detail with TAT, addresses, and tagging fields
    viewOrder(event) {
        event.preventDefault();
        const recordId = event.currentTarget.dataset.id;

        getOrderDetail({ orderId: recordId })
            .then(result => {
                this.processOrderDetail(result);
            })
            .catch(error => {
                console.error(error);
            });
    }

    // Tab switching
    showDetailTab() {
        this.activeTab = 'details';
    }
    showProductsTab() {
        this.activeTab = 'products';
        if (this.selectedOrder && this.selectedOrder.Id) {
            this.loadOrderItems();
        }
    }

    // Load order items
    loadOrderItems() {
        getOrderItems({ orderId: this.selectedOrder.Id })
            .then(data => {
                this.orderItems = data.map(item => ({
                    ...item,
                    formattedUnitPrice: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(item.UnitPrice),
                    formattedTotalPrice: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(item.TotalPrice)
                }));
            })
            .catch(error => {
                console.error('Error loading order items:', error);
            });
    }

    // Add Product Modal (unchanged)
    openAddProductModal() {
        const pricebookId = this.selectedOrder.Pricebook2Id;

        if (!pricebookId) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Error',
                    message: 'Order has no pricebook assigned.',
                    variant: 'error'
                })
            );
            return;
        }

        getActiveProductsForPricebook({
            pricebook2Id: pricebookId,
            orderId: this.selectedOrder.Id
        })
            .then(data => {

                this.productsUI = data.map(pbe => ({
                    pricebookEntryId: pbe.pricebookEntryId,
                    productName: pbe.productName,
                    unitPrice: pbe.unitPrice,
                    formattedPrice: new Intl.NumberFormat('en-IN', {
                        style: 'currency',
                        currency: 'INR'
                    }).format(pbe.unitPrice),
                    quantity: 0,
                    availableStock: pbe.availableStock
                }));

                this.showAddProductModal = true;
            })
            .catch(error => {
                console.error(error);
            });
    }
    closeAddProductModal() {
        this.showAddProductModal = false;
        this.addProductStep = 1;
        this.selectedProductEntries = [];
        this.selectedProductsWithQuantity = [];
    }

    handleProductSelection(event) {
        this.selectedProductEntries = event.detail.value;
    }

    handleQuantityChange(event) {
        const id = event.target.dataset.id;
        let value = parseInt(event.detail.value, 10);

        if (!value || value < 0) value = 0;

        this.productsUI = this.productsUI.map(p =>
            p.pricebookEntryId === id
                ? { ...p, quantity: value }
                : p
        );
    }

    handleModalCancelBack() {
        if (this.isStepOne) {
            this.closeAddProductModal();
        } else {
            this.prevStep();
        }
    }

    handleModalNextDone() {
        if (this.isStepOne) {
            this.nextStep();
        } else {
            this.saveOrderItems();
        }
    }

    nextStep() {
        if (this.selectedProductEntries.length === 0) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Warning',
                    message: 'Please select at least one product.',
                    variant: 'warning'
                })
            );
            return;
        }
        this.selectedProductsWithQuantity = this.selectedProductEntries.map(entryId => {
            const pbe = this.availableProductsMap[entryId];
            return {
                pricebookEntryId: entryId,
                productName: pbe.Product2.Name,
                unitPrice: pbe.UnitPrice,
                quantity: 1
            };
        });
        this.addProductStep = 2;
    }

    prevStep() {
        this.addProductStep = 1;
    }

    increaseQuantity(event) {
        const id = event.currentTarget.dataset.id;
        this.selectedProductsWithQuantity = this.selectedProductsWithQuantity.map(p =>
            p.pricebookEntryId === id ? { ...p, quantity: p.quantity + 1 } : p
        );
    }

    decreaseQuantity(event) {
        const id = event.currentTarget.dataset.id;
        this.selectedProductsWithQuantity = this.selectedProductsWithQuantity.map(p =>
            p.pricebookEntryId === id && p.quantity > 1 ? { ...p, quantity: p.quantity - 1 } : p
        );
    }

    saveOrderItems() {

        const itemsToCreate = this.productsUI
            .filter(p => p.quantity > 0)
            .map(p => ({
                pricebookEntryId: p.pricebookEntryId,
                quantity: p.quantity,
                unitPrice: p.unitPrice
            }));

        if (itemsToCreate.length === 0) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Warning',
                    message: 'Please enter quantity',
                    variant: 'warning'
                })
            );
            return;
        }

        createOrderItems({
            orderId: this.selectedOrder.Id,
            items: itemsToCreate
        })
            .then(() => {

                this.closeAddProductModal();
                this.loadOrderItems();

                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Success',
                        message: 'Products added successfully',
                        variant: 'success'
                    })
                );
            })
            .catch(error => {

                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Error',
                        message: error.body?.message || 'Error adding products',
                        variant: 'error'
                    })
                );
            });
    }

    backToList() {
        this.showDetailView = false;
        this.showListView = true;
        this.selectedOrder = null;
    }

    // ===== NEW ORDER TYPE FLOW =====
    openCreateOrder() {
        this.showOrderTypeModal = true;
    }

    closeOrderTypeModal() {
        this.showOrderTypeModal = false;
        // this.orderType = null;
    }

    selectPrimary() {
        this.orderType = 'primary';
        this.refreshFieldVisibility();
        this.closeOrderTypeModal();
        this.openCreateOrderModal();
    }

    selectSecondary() {
        this.orderType = 'secondary';
        this.refreshFieldVisibility();
        this.closeOrderTypeModal();
        this.openCreateOrderModal();
    }

    refreshFieldVisibility() {
        this.orderFields = this.orderFields.map(field => {

            if (field.fieldPath === 'Tagged_to__c') {
                field.isDealerFieldHidden = this.orderType !== 'secondary';
            }

            return field;
        });
    }

    openCreateOrderModal() {
        this.showCreateModal = true;
        this.resetForm();
    }

    backToOrderType() {
        this.closeModal();
        this.openCreateOrder(); // show type modal again
    }

    closeModal() {
        this.showCreateModal = false;
        this.resetForm();
    }

    resetForm() {
        this.formData = {
            accountId: '',
            pricebook2Id: '',
            name: '',
            effectiveDate: '',
            endDate: '',
            status: '',
            type: '',
            poNumber: '',
            poDate: '',
            billToContactId: '',
            shipToContactId: '',
            shippingAddress: '',
            billingAddress: '',
            estimatedDeliveryDate: '',
            taggedToId: ''
        };
        this.errors = {};
    }

    handleFieldChange(event) {
        const field = event.target.name;
        this.formData[field] = event.detail.value;
        if (this.errors[field]) {
            this.errors = { ...this.errors, [field]: null };
        }
    }

    validateForm() {
        const errors = {};
        if (!this.formData.effectiveDate) errors.effectiveDate = 'Effective Date is required';
        if (!this.formData.status) errors.status = 'Status is required';
        if (this.isSecondaryOrder && !this.formData.taggedToId) {
            errors.taggedToId = 'Tagged To Contact is required';
        }
        this.errors = errors;
        return Object.keys(errors).length === 0;
    }

  handleSubmit() {

    if (!this.validateForm()) return;

    const payload = {
        ...this.formData,
        AccountId: this.formData.accountId,
        Pricebook2Id: '01sdL00000IDKVhQAP',
        RecordTypeId: this.isPrimaryOrder ? this.PRIMARY_RT : this.SECONDARY_RT,
        Tagged_By__c: this.isPrimaryOrder ? this.currentUserId : null,
        Tagged_to__c: this.isSecondaryOrder ? this.formData.taggedToId : null
    };

    if (this.isEditMode) {
        updateOrder({
            orderData: JSON.stringify(payload)
        })
        .then(() => {

            this.showCreateModal = false;
            this.isEditMode = false;

            this.dispatchEvent(new ShowToastEvent({
                title: 'Success',
                message: 'Order updated successfully',
                variant: 'success'
            }));

            this.viewOrder({
                currentTarget: { dataset: { id: this.selectedOrder.Id } },
                preventDefault: () => {}
            });

        });
    } else {

        createOrder({ orderData: JSON.stringify(payload) })
        .then(() => {

            this.showCreateModal = false;

            this.dispatchEvent(new ShowToastEvent({
                title: 'Success',
                message: 'Order created successfully',
                variant: 'success'
            }));

            refreshApex(this.wiredOrdersResult);
        });
    }
}

    @track isEditMode = false;
    handleEdit() {
    this.isEditMode = true;
    this.showCreateModal = true;

    this.formData = {};

    this.orderFields.forEach(field => {
        let val;

        if (field.fieldPath.includes('.')) {
            val = field.fieldPath
                .split('.')
                .reduce((obj, key) => obj?.[key], this.selectedOrder);
        } else {
            val = this.selectedOrder[field.fieldPath];
        }

        this.formData[field.fieldPath] = val ?? '';
    });

    // 🔥 Sync UI
    this.orderFields = this.orderFields.map(f => {
        let val;

        if (f.fieldPath.includes('.')) {
            val = f.fieldPath
                .split('.')
                .reduce((obj, key) => obj?.[key], this.selectedOrder);
        } else {
            val = this.selectedOrder[f.fieldPath];
        }

        return {
            ...f,
            value: val ?? ''
        };
    });
}
    prepareDetailFields() {

        if (!this.selectedOrder || !this.orderFields) return;

        this.detailFields = this.orderFields.map(field => {

            let value;

            // 🔥 HANDLE SPECIAL FIELDS
            if (field.fieldPath === 'AccountId') {
                value = this.selectedOrder?.Account?.Name;
            }
            else if (field.fieldPath === 'Tagged_to__c') {
                value = this.selectedOrder?.Tagged_to__r?.Name;
            }
            else if (field.fieldPath === 'Tagged_By__c') {
                value = this.selectedOrder?.Tagged_By__r?.Name;
            }
            else if (field.fieldPath === 'BillToContactId') {
                value = this.selectedOrder?.BillToContact?.Name;
            }
            else if (field.fieldPath === 'ShipToContactId') {
                value = this.selectedOrder?.ShipToContact?.Name;
            }
            else {
                value = this.selectedOrder[field.fieldPath];
            }

            return {
                label: field.label,
                value: value || '-'
            };
        });
    }

    cancelEdit() {
    this.isEditMode = false;
}

saveEdit() {

    updateOrder({
        orderData: JSON.stringify(this.formData)
    })
    .then(() => {

        this.isEditMode = false;

        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Success',
                message: 'Order updated successfully',
                variant: 'success'
            })
        );

        this.viewOrder({ currentTarget: { dataset: { id: this.selectedOrder.Id } }, preventDefault: () => {} });

    })
    .catch(error => {
        console.error(error);
    });
}

get modalTitle() {
    return this.isEditMode ? 'Edit Order' : `Create New ${this.orderTypeLabel} Order`;
}

get modalButtonLabel() {
    return this.isEditMode ? 'Save Changes' : 'Create Order';
}

handleMarkStage() {

    if (!this.selectedStage) return;

    updateOrderStage({
        orderId: this.selectedOrder.Id,
        status: this.selectedStage
    })
    .then(() => {

        this.currentStage = this.selectedStage;

        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Success',
                message: 'Order stage updated',
                variant: 'success'
            })
        );

        // refresh detail
        this.viewOrder({
            currentTarget: { dataset: { id: this.selectedOrder.Id } },
            preventDefault: () => {}
        });

    })
    .catch(error => {
        console.error(error);
    });
}
}