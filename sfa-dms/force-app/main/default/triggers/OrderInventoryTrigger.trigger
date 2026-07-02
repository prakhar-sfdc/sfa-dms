trigger OrderInventoryTrigger on Order (after update) {

    List<Id> dispatchedOrderIds = new List<Id>();

    for (Order o : Trigger.new) {
        Order oldRec = Trigger.oldMap.get(o.Id);

        if (oldRec.Status != 'Dispatched' && o.Status == 'Dispatched') {
            dispatchedOrderIds.add(o.Id);
        }
    }

    if (!dispatchedOrderIds.isEmpty()) {
        InventoryMovementHandler.handleOrderDelivered(dispatchedOrderIds);
    }
}