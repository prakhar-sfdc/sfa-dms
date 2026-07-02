trigger OrderTrigger on Order (before insert) {
    if (Trigger.isBefore && Trigger.isInsert) {
        OrderHandler.handleBeforeInsert(Trigger.new);
    }
}