import { LightningElement, api, track, wire } from 'lwc';
import getOrderProducts from '@salesforce/apex/OrderHelper.getOrderProducts';
import createSubOrders from '@salesforce/apex/SubOrderService.createSubOrders';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class SubOrderManager extends LightningElement {
    @api recordId;
    @track parentProducts = [];
    @track subOrders = [];
    @track subOrderCount = 1;
    @track step1 = true;
    @track step2 = false;

    // Load parent order products and making the parentProducts Array of objects here
    @wire(getOrderProducts, { orderId: '$recordId' })
    wiredProducts({ error, data }) {
        if (data) {
            this.parentProducts = data.map((p, index) => ({
                rowKey: `P_${index}`,
                productId: p.Product2Id,
                productName: p.Product2.Name,
                quantity: p.Quantity,
                unitPrice: p.UnitPrice
            }));
        } else if (error) {
            console.error('Error fetching products:', error);
        }
    }

    // Sub Order count change handled here
    handleSubOrderCountChange(event) {
        // converting the text into integer with base 10 here
        this.subOrderCount = parseInt(event.target.value, 10) || 1;
    }


    goToStep2() {
        this.subOrders = [];
        for (let i = 0; i < this.subOrderCount; i++) {
            // making the array of child product to display in the table of every subproduct
            this.subOrders.push({
                index: i,
                displayIndex: i + 1,
                rowKey: `SO_${i}`,
                name: `SubOrder ${i + 1}`,
                productSplits: this.parentProducts.map((p, pi) => ({
                    index: pi,
                    rowKey: `SO_${i}_P_${pi}`,
                    productId: p.productId,
                    productName: p.productName,
                    quantity: 0,
                    unitPrice: p.unitPrice,
                    discount: 0,
                    subtotal: 0
                }))
            });
        }
        // changing modals
        this.step1 = false;
        this.step2 = true;
    }

    goBackToStep1() {
        this.step1 = true;
        this.step2 = false;
    }

    // name change of the suborder
    handleSubOrderNameChange(event) {
        const index = event.target.dataset.index;
        this.subOrders[index].name = event.target.value;
    }

    handleDiscountChange(event) {
        const soIndex = event.target.dataset.soIndex;
        const prodIndex = event.target.dataset.prodIndex;
        const value = parseFloat(event.target.value) || 0;
        this.subOrders[soIndex].productSplits[prodIndex].discount = value;
        this.recalculateSubtotal(soIndex, prodIndex);
    }

    handleQuantityChange(event) {
        const soIndex = event.target.dataset.soIndex;
        const prodIndex = event.target.dataset.prodIndex;
        const value = parseFloat(event.target.value) || 0;
        this.subOrders[soIndex].productSplits[prodIndex].quantity = value;
        this.recalculateSubtotal(soIndex, prodIndex);
    }

    recalculateSubtotal(soIndex, prodIndex) {
        const prod = this.subOrders[soIndex].productSplits[prodIndex];
        const discountFactor = (100 - (prod.discount || 0)) / 100;
        prod.subtotal = (prod.quantity * prod.unitPrice * discountFactor).toFixed(2);
    }
    // Save
    async handleSave() {
        try {
            const payload = this.subOrders.map(so => ({
                name: so.name,
                productSplits: so.productSplits
                    .filter(ps => Number(ps.quantity) !== 0)
                    .map(ps => ({
                        productId: normalizeId(ps.productId),
                        quantity: ps.quantity ? Number(ps.quantity) : 0,
                        unitPrice: ps.unitPrice ? Number(ps.unitPrice) : 0
                    }))
            }));
            console.log(JSON.stringify(payload));
            // converting the array of object into string to deserilize later (apex aasaani se samajh paaye).
            const subOrdersJson = JSON.stringify(payload);
            // calling apex to create the subOrder.
            await createSubOrders({
                parentOrderId: this.recordId,
                subOrdersJson: subOrdersJson
            });

            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Success',
                    message: 'SubOrders created successfully!',
                    variant: 'success'
                })
            );
            this.dispatchEvent(new CustomEvent('suborderscreated'));
            this.step1 = true;
            this.step2 = false;
            this.subOrders = [];
        } catch (error) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Error',
                    message: error.body?.message || error.message,
                    variant: 'error'
                })
            );
        }
    }
}

// To normalize id val should not be null , should be string , should not be empty
function normalizeId(val) {
    if (val && typeof val === 'string' && val.trim() !== '') {
        return val;
    }
    return null;
}