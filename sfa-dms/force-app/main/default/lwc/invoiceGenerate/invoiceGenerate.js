import { LightningElement, wire } from 'lwc';
import generateInvoice from '@salesforce/apex/InvoiceService.generateInvoice';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { CloseActionScreenEvent } from 'lightning/actions';
import { CurrentPageReference } from 'lightning/navigation';

export default class GenerateInvoiceAction extends LightningElement {

    recordId;

    @wire(CurrentPageReference)
    getStateParameters(currentPageReference) {
        if (currentPageReference) {

            console.log('Page Ref:', currentPageReference);

            // LWR uses this format
            this.recordId = currentPageReference.attributes?.recordId 
                || currentPageReference.state?.recordId;

            console.log('recordId from URL:', this.recordId);
        }
    }

    connectedCallback() {
        this.generate();
    }

    async generate() {
        try {

            const invoiceId = await generateInvoice({
                recordId: this.recordId,
            });

            this.showToast('Success', 'Invoice generated successfully', 'success');

        } catch (error) {

            this.showToast(
                'Error',
                error.body?.message || error.message,
                'error'
            );

        } finally {
            this.dispatchEvent(new CloseActionScreenEvent());
        }
    }

    showToast(title, message, variant) {
        this.dispatchEvent(
            new ShowToastEvent({ title, message, variant })
        );
    }
}