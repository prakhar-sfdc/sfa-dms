@isTest
private class ExpenseControllerTest {

    private static ExpenseController.ExpenseInput mileageInput() {
        ExpenseController.ExpenseInput inp = new ExpenseController.ExpenseInput();
        inp.expenseType = 'Mileage';
        inp.source      = 'Manual';
        inp.distance    = 20;
        inp.vehicleType = 'Two Wheeler';
        inp.city        = 'Pune';
        inp.description = 'Field visits';
        inp.expenseDate = String.valueOf(Date.today());
        return inp;
    }

    @isTest
    static void testCreateMileageComputesAmount() {
        Test.startTest();
        Id expId = ExpenseController.createExpense(mileageInput());
        Test.stopTest();

        Expense__c exp = [
            SELECT Amount__c, Distance__c, Rate_Per_Km__c, Status__c, Expense_Source__c
            FROM Expense__c WHERE Id = :expId
        ];
        // Two Wheeler seed rate = 5/km, 20 km => 100
        System.assertEquals(100, exp.Amount__c, 'Amount should be km x rate');
        System.assertEquals(20, exp.Distance__c);
        System.assertEquals('Draft', exp.Status__c, 'New expense starts as Draft');
    }

    @isTest
    static void testSubmitWithoutReceiptFails() {
        Id expId = ExpenseController.createExpense(mileageInput());
        Boolean threw = false;
        Test.startTest();
        try {
            ExpenseController.submitExpense(expId);
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();
        System.assert(threw, 'Submit must fail without a receipt for a receipt-required category');
        Expense__c exp = [SELECT Status__c FROM Expense__c WHERE Id = :expId];
        System.assertEquals('Draft', exp.Status__c, 'Should remain Draft');
    }

    @isTest
    static void testUploadReceiptThenSubmit() {
        Id expId = ExpenseController.createExpense(mileageInput());
        String b64 = EncodingUtil.base64Encode(Blob.valueOf('fake-receipt-image'));

        Test.startTest();
        Id docId = ExpenseController.uploadReceipt(expId, 'receipt.jpg', b64);
        ExpenseController.submitExpense(expId);
        Test.stopTest();

        System.assertNotEquals(null, docId, 'ContentDocumentId returned');
        Expense__c exp = [SELECT Status__c, Receipt_Count__c, Submitted_On__c FROM Expense__c WHERE Id = :expId];
        System.assertEquals(1, exp.Receipt_Count__c, 'Receipt count incremented');
        System.assertEquals('Submitted', exp.Status__c);
        System.assertNotEquals(null, exp.Submitted_On__c);

        Integer links = [SELECT COUNT() FROM ContentDocumentLink WHERE LinkedEntityId = :expId];
        System.assertEquals(1, links, 'Receipt linked to the expense');
    }

    @isTest
    static void testDailyAllowanceSubmitsWithoutReceipt() {
        ExpenseController.ExpenseInput inp = new ExpenseController.ExpenseInput();
        inp.expenseType = 'Daily Allowance';
        inp.source      = 'Manual';
        inp.amount      = 750;
        inp.city        = 'Pune';

        Test.startTest();
        Id expId = ExpenseController.createExpense(inp);
        ExpenseController.submitExpense(expId);
        Test.stopTest();

        Expense__c exp = [SELECT Status__c, Amount__c FROM Expense__c WHERE Id = :expId];
        System.assertEquals('Submitted', exp.Status__c, 'DA is receipt-exempt');
        System.assertEquals(750, exp.Amount__c);
    }

    @isTest
    static void testGetFormConfig() {
        Test.startTest();
        Map<String, Object> cfg = ExpenseController.getExpenseFormConfig();
        Test.stopTest();

        System.assert(cfg.containsKey('mileageRates'));
        System.assert(cfg.containsKey('policies'));
        System.assert(((List<Object>) cfg.get('mileageRates')).size() > 0, 'Seeded mileage rates present');
        System.assert(((List<Object>) cfg.get('policies')).size() > 0, 'Seeded policies present');
        System.assertNotEquals(null, cfg.get('remainingBudget'));
    }

    @isTest
    static void testGetTodayRouteDistance() {
        insert new Journey_Plan__c(Plan_Date__c = Date.today(), Total_Distance__c = 42.5);

        Test.startTest();
        Decimal km = ExpenseController.getTodayRouteDistance();
        Test.stopTest();

        System.assertEquals(42.5, km, 'Returns today plan rolled-up distance');
    }

    @isTest
    static void testGetTodayRouteDistanceNoPlan() {
        Test.startTest();
        Decimal km = ExpenseController.getTodayRouteDistance();
        Test.stopTest();
        System.assertEquals(0, km, 'No plan => 0');
    }

    @isTest
    static void testDashboardReadMethods() {
        insert new List<Expense__c>{
            new Expense__c(Expense_Type__c = 'Travel', Amount__c = 200, Status__c = 'Approved',
                Expense_Date__c = Date.today(), Monthly_Budget__c = 5000),
            new Expense__c(Expense_Type__c = 'Food', Amount__c = 150, Status__c = 'Submitted',
                Expense_Date__c = Date.today()),
            new Expense__c(Expense_Type__c = 'Misc', Amount__c = 90, Status__c = 'Draft',
                Expense_Date__c = Date.today())
        };

        Test.startTest();
        Map<String, Object> summary = ExpenseController.getExpenseSummary();
        Map<String, Object> budget  = ExpenseController.getBudgetSummary();
        List<Map<String, Object>> byType = ExpenseController.getExpensesByType();
        List<Expense__c> recent = ExpenseController.getRecentExpenses(5);
        List<Expense__c> all    = ExpenseController.getAllExpenses();
        Date td = Date.today();
        List<Expense__c> byMonth = ExpenseController.getRecentExpensesByMonth(5, td.year(), td.month());
        Test.stopTest();

        System.assertEquals(3, (Integer) summary.get('totalSubmissions'));
        System.assertEquals(5000, budget.get('totalBudget'));
        System.assert(byType.size() >= 1);
        System.assertEquals(3, recent.size());
        System.assertEquals(3, all.size());
        System.assertEquals(3, byMonth.size());
    }

    @isTest
    static void testGetSpendByCategory() {
        insert new List<Expense__c>{
            new Expense__c(Expense_Type__c = 'Mileage', Amount__c = 100, Status__c = 'Approved', Expense_Date__c = Date.today()),
            new Expense__c(Expense_Type__c = 'Food', Amount__c = 250, Status__c = 'Submitted', Expense_Date__c = Date.today()),
            new Expense__c(Expense_Type__c = 'Misc', Amount__c = 50, Status__c = 'Draft', Expense_Date__c = Date.today())
        };

        Test.startTest();
        List<Map<String, Object>> rows = ExpenseController.getSpendByCategory();
        Test.stopTest();

        // Draft excluded => only Mileage + Food
        System.assertEquals(2, rows.size(), 'Only Submitted/Approved counted');
    }

    @isTest
    static void testGetExpenseReceipts() {
        Id expId = ExpenseController.createExpense(mileageInput());
        ExpenseController.uploadReceipt(expId, 'bill.png',
            EncodingUtil.base64Encode(Blob.valueOf('img-bytes')));

        Test.startTest();
        List<Map<String, Object>> receipts = ExpenseController.getExpenseReceipts(expId);
        Test.stopTest();

        System.assertEquals(1, receipts.size());
        System.assertEquals(true, receipts[0].get('isImage'), 'png flagged as image');
        System.assert(((String) receipts[0].get('downloadUrl')).contains('/download/'));
    }

    @isTest
    static void testGetExpenseReceiptsNone() {
        Id expId = ExpenseController.createExpense(mileageInput());
        Test.startTest();
        List<Map<String, Object>> receipts = ExpenseController.getExpenseReceipts(expId);
        Test.stopTest();
        System.assertEquals(0, receipts.size());
    }
}
