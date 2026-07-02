trigger SubOrderTrigger on Sub_Order__c (after update) {

    List<Id> deliveredIds = new List<Id>();

    for (Sub_Order__c so : Trigger.new) {
        Sub_Order__c oldRec = Trigger.oldMap.get(so.Id);

        if (oldRec.Status__c != 'Dispatched' && so.Status__c == 'Dispatched') {
            deliveredIds.add(so.Id);
        }
    }

    if (!deliveredIds.isEmpty()) {
        // 🔹 2. Move Inventory (ONLY Primary handled inside class)
        InventoryMovementHandler.handleSubOrderDelivered(deliveredIds);
    }
}