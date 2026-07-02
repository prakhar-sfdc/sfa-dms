trigger AccountDealerTrigger on Account (before insert) {
    if (Trigger.isBefore && Trigger.isInsert) {
        AccountDealerController.handleBeforeInsert(Trigger.new);
    }
}