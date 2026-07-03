@isTest
private class JourneyPlanControllerTest {

    @testSetup
    static void setup() {
        List<Account> accts = new List<Account>();
        Account a1 = new Account(Name = 'Acme Distributors', BillingCity = 'Mumbai',
            BillingState = 'MH', Priority__c = 'High');
        a1.BillingLatitude = 19.0760;  a1.BillingLongitude = 72.8777;
        Account a2 = new Account(Name = 'Globex Traders', BillingCity = 'Pune',
            BillingState = 'MH', Priority__c = 'Medium');
        a2.BillingLatitude = 18.5204;  a2.BillingLongitude = 73.8567;
        accts.add(a1); accts.add(a2);
        insert accts;
    }

    private static Id acctId(String name) {
        return [SELECT Id FROM Account WHERE Name = :name LIMIT 1].Id;
    }

    @isTest
    static void testAddDayWeekMonth() {
        String today = String.valueOf(Date.today());
        Test.startTest();
        String i1 = JourneyPlanController.addVisit(acctId('Acme Distributors'), today, '09:30', 'Product Demo', 'High');
        String i2 = JourneyPlanController.addVisit(acctId('Globex Traders'), today, '11:00', 'Stock Check', 'Medium');
        Test.stopTest();

        JourneyPlanController.PlanDay day = JourneyPlanController.getDayPlan(today);
        System.assertEquals(2, day.plannedVisits, 'two visits planned');
        System.assertEquals(2, day.items.size(), 'two items returned');
        System.assertNotEquals(null, i1);
        System.assertNotEquals(null, i2);

        String weekStart = String.valueOf(Date.today().toStartOfWeek());
        List<JourneyPlanController.WeekDay> week = JourneyPlanController.getWeekPlan(weekStart);
        System.assertEquals(7, week.size(), 'seven week days');

        List<JourneyPlanController.MonthDay> month =
            JourneyPlanController.getMonthPlan(Date.today().year(), Date.today().month());
        System.assert(month.size() >= 28, 'month days');

        Map<String,Integer> counts = JourneyPlanController.getVisitCountsForRange(today, today);
        System.assertEquals(2, counts.get(today), 'count for today');
    }

    @isTest
    static void testCheckInOutRoute() {
        String today = String.valueOf(Date.today());
        String i1 = JourneyPlanController.addVisit(acctId('Acme Distributors'), today, '09:30', 'Product Demo', 'High');
        String i2 = JourneyPlanController.addVisit(acctId('Globex Traders'), today, '11:00', 'Stock Check', 'Medium');

        Test.startTest();
        JourneyPlanController.checkInItem(i1, 19.0760, 72.8777, 'Mumbai');
        JourneyPlanController.checkOutItem(i1, 19.0760, 72.8777, 'Mumbai', 'Successful', 'ok');
        JourneyPlanController.DayItem d2 = JourneyPlanController.checkInItem(i2, 18.5204, 73.8567, 'Pune');
        JourneyPlanController.checkOutItem(i2, 18.5204, 73.8567, 'Pune', 'Successful', 'done');
        Test.stopTest();

        System.assertNotEquals(null, d2.distanceFromPrev, 'distance computed from previous stop');
        System.assert(d2.distanceFromPrev > 0, 'positive distance Mumbai->Pune');

        JourneyPlanController.PlanDay day = JourneyPlanController.getDayPlan(today);
        System.assertEquals(2, day.completedVisits, 'both completed');
        System.assertEquals(0, day.pendingVisits, 'none pending');
        System.assertEquals(100, day.successRate, 'full success');
        System.assert(day.totalDistance > 0, 'route distance rolled up');
    }

    @isTest
    static void testReorderDeleteOutcome() {
        String today = String.valueOf(Date.today());
        String i1 = JourneyPlanController.addVisit(acctId('Acme Distributors'), today, '09:30', 'Product Demo', 'High');
        String i2 = JourneyPlanController.addVisit(acctId('Globex Traders'), today, '11:00', 'Stock Check', 'Medium');

        Test.startTest();
        JourneyPlanController.reorderVisits(new List<String>{ i2, i1 });
        JourneyPlanController.saveVisitOutcome(i1, 'Postponed', 'reschedule');
        JourneyPlanController.deleteVisit(i2);
        Test.stopTest();

        JourneyPlanController.PlanDay day = JourneyPlanController.getDayPlan(today);
        System.assertEquals(1, day.plannedVisits, 'one remaining after delete');
    }

    @isTest
    static void testUpdateVisitNotes() {
        String today = String.valueOf(Date.today());
        String i1 = JourneyPlanController.addVisit(acctId('Acme Distributors'), today, '09:30', 'Product Demo', 'High');
        JourneyPlanController.saveVisitOutcome(i1, 'Successful', 'first');

        Test.startTest();
        JourneyPlanController.updateVisitNotes(i1, 'updated note only');
        Test.stopTest();

        Journey_Plan_Item__c rec = [SELECT Visit_Notes__c, Visit_Outcome__c FROM Journey_Plan_Item__c WHERE Id = :i1];
        System.assertEquals('updated note only', rec.Visit_Notes__c, 'notes updated');
        System.assertEquals('Successful', rec.Visit_Outcome__c, 'outcome preserved (not clobbered)');
    }

    @isTest
    static void testMarketAnalysis() {
        String today = String.valueOf(Date.today());
        String i1 = JourneyPlanController.addVisit(acctId('Acme Distributors'), today, '09:30', 'Product Demo', 'High');
        JourneyPlanController.checkInItem(i1, 19.0760, 72.8777, 'Mumbai');

        Test.startTest();
        String aId = JourneyPlanController.saveMarketAnalysis(i1, 'Rival Co', 'Rival 500', 'Ours 500',
            95, 90, 40, 60, 55, 'Good', 'No / Yes - Ours', 'Neutral', 'Stable', 'Medium');
        Test.stopTest();

        System.assertNotEquals(null, aId, 'analysis inserted');
        List<JourneyPlanController.MarketAnalysis> list1 = JourneyPlanController.getItemAnalyses(i1);
        System.assertEquals(1, list1.size(), 'one analysis returned');
        System.assertEquals('Rival Co', list1[0].competitorName);

        JourneyPlanController.DayItem det = JourneyPlanController.getItemDetail(i1);
        System.assertEquals(19.0760, det.checkInLat, 'check-in lat surfaced in detail');
    }

    @isTest
    static void testSearchAndUpload() {
        List<JourneyPlanController.AccountOption> opts = JourneyPlanController.searchAccounts('Acme');
        System.assert(!opts.isEmpty(), 'account search returns Acme');

        String csv = 'Account,Date,Time,Purpose,Priority\n'
            + 'Acme Distributors,' + String.valueOf(Date.today().addDays(2)) + ',09:30,Stock Check,High\n'
            + 'Globex Traders,' + String.valueOf(Date.today().addDays(2)) + ',10:45,Product Demo,Medium\n'
            + 'Unknown Co,' + String.valueOf(Date.today().addDays(2)) + ',12:00,Stock Check,Low';
        String b64 = EncodingUtil.base64Encode(Blob.valueOf(csv));

        Test.startTest();
        JourneyPlanController.UploadResult res = JourneyPlanController.uploadPlanCsv(b64);
        Test.stopTest();

        System.assertEquals(2, res.itemsCreated, 'two valid rows imported');
        System.assertEquals(1, res.rowsSkipped, 'unknown account skipped');
        System.assertEquals(1, res.plansCreated, 'one plan for the date');
    }
}
