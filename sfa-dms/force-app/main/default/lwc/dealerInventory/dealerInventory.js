import { LightningElement, wire, track } from 'lwc';
import getDealerInventory from '@salesforce/apex/DealerInventoryController.getDealerInventory';

export default class DealerInventory extends LightningElement {

    @track inventory = [];

    @wire(getDealerInventory)
    wiredInventory({data,error}){

        if(data){

            this.inventory = data.map(item=>{

                let status = 'In Stock';
                let css = 'status positive';

                if(item.Available_Stock__c < 5){
                    status = 'Low Stock';
                    css = 'status warning';
                }

                if(item.Available_Stock__c === 0){
                    status = 'Out of Stock';
                    css = 'status negative';
                }

                return{
                    ...item,
                    formattedPrice: new Intl.NumberFormat('en-IN',{
                        style:'currency',
                        currency:'INR'
                    }).format(item.Unit_Price__c),

                    stockStatus:status,
                    stockClass:css
                }

            });

        }

        if(error){
            console.error(error);
        }

    }

}