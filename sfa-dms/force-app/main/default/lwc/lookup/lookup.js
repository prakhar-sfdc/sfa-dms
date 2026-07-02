import { LightningElement, api, track } from 'lwc';
import searchRecords from '@salesforce/apex/LookupController.searchRecords';

export default class Lookup extends LightningElement {

    @api label;
    @api objectApiName;
    @api isSecondary = false; // 🔥 important

    @track records = [];
    @track searchKey = '';
    @track selectedName = '';
    @track showDropdown = false;

    selectedId;

    // ================= SEARCH =================
    handleChange(event) {
        this.searchKey = event.target.value;

        if (this.searchKey.length < 2) return;

        searchRecords({
            searchKey: this.searchKey,
            objectName: this.objectApiName,
            isSecondary: this.isSecondary
        })
        .then(res => {
            this.records = res;
            this.showDropdown = true;
        });
    }

    handleFocus() {
        this.showDropdown = true;
    }

    // ================= SELECT =================
    handleSelect(event) {
        this.selectedId = event.currentTarget.dataset.id;
        this.selectedName = event.currentTarget.dataset.name;

        this.showDropdown = false;

        this.dispatchEvent(new CustomEvent('lookupchange', {
            detail: { selectedRecordId: this.selectedId }
        }));
    }

    // ================= CLEAR =================
    clearSelection() {
        this.selectedId = null;
        this.selectedName = '';
        this.searchKey = '';
    }
}