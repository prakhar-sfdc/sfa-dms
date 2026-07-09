public with sharing class ExpenseController {

    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getExpenseSummary() {

        Id userId = UserInfo.getUserId();

        // Total expenses + total submissions
        AggregateResult totalAgg = [
            SELECT
                SUM(Amount__c) totalAmount,
                COUNT(Id) totalCount
            FROM Expense__c
            WHERE CreatedById = :userId
        ];

        // Approved count
        Integer approvedCount = [
            SELECT COUNT()
            FROM Expense__c
            WHERE CreatedById = :userId
            AND Status__c = 'Approved'
        ];

        // Pending count
        Integer pendingCount = [
            SELECT COUNT()
            FROM Expense__c
            WHERE CreatedById = :userId
            AND Status__c = 'Submitted'
        ];

        Map<String, Object> response = new Map<String, Object>();
        response.put('totalAmount', totalAgg.get('totalAmount') != null ? totalAgg.get('totalAmount') : 0);
        response.put('approvedCount', approvedCount);
        response.put('pendingCount', pendingCount);
        response.put('totalSubmissions', totalAgg.get('totalCount'));

        return response;
    }
    
    
    @AuraEnabled(cacheable=true)
public static Map<String, Object> getBudgetSummary() {

    Id userId = UserInfo.getUserId();

    // Get latest budget entered by user from Expense record
    Expense__c latestBudgetExpense = [
        SELECT Monthly_Budget__c
        FROM Expense__c
        WHERE OwnerId = :userId
        AND Monthly_Budget__c != null
        ORDER BY CreatedDate DESC
        LIMIT 1
    ];

    Decimal totalBudget = latestBudgetExpense.Monthly_Budget__c != null
        ? latestBudgetExpense.Monthly_Budget__c
        : 0;

    // ✅ Sum all submitted/approved expenses
    AggregateResult ar = [
        SELECT SUM(Amount__c) total
        FROM Expense__c
        WHERE OwnerId = :userId
        AND Status__c IN ('Approved', 'Submitted')
    ];

    Decimal usedAmount = (Decimal) ar.get('total');
    if (usedAmount == null) usedAmount = 0;

    Decimal remaining = totalBudget - usedAmount;

    Decimal usedPercent = 0;
    if (totalBudget > 0) {
        usedPercent = (usedAmount / totalBudget) * 100;
    }

    String status = (usedAmount > totalBudget) ? 'Over Budget' : 'Within Budget';

    return new Map<String, Object>{
        'totalBudget' => totalBudget,
        'usedAmount' => usedAmount,
        'remainingAmount' => remaining,
        'usedPercent' => usedPercent.setScale(1),
        'status' => status
    };
}

    @AuraEnabled(cacheable=true)
public static List<Map<String, Object>> getExpensesByType() {

    Id userId = UserInfo.getUserId();

    List<AggregateResult> results = [
        SELECT Expense_Type__c type, SUM(Amount__c) total
        FROM Expense__c
        WHERE OwnerId = :userId
        AND Status__c = 'Approved'
        GROUP BY Expense_Type__c
    ];

    List<Map<String, Object>> response = new List<Map<String, Object>>();

    for (AggregateResult ar : results) {
        response.add(new Map<String, Object>{
            'type' => (String) ar.get('type'),
            'amount' => (Decimal) ar.get('total')
        });
    }

    return response;
}


    @AuraEnabled(cacheable=true)
public static List<Expense__c> getRecentExpenses(Integer limitSize) {

    Id userId = UserInfo.getUserId();

    return [
        SELECT
            Id,
            Name,
            Expense_Date__c,
            Expense_Type__c,
            Description__c,
            Amount__c,
            Status__c,
            Expense_Source__c,
            Distance__c,
            Vehicle_Type__c,
            Rate_Per_Km__c,
            From_Location__c,
            To_Location__c,
            Receipt_Count__c,
            City__c,
            Rejection_Reason__c,
            Submitted_On__c,
            Approved_On__c
        FROM Expense__c
        WHERE OwnerId = :userId
        ORDER BY CreatedDate DESC
        LIMIT :limitSize
    ];
}
    
    @AuraEnabled(cacheable=true)
public static List<Expense__c> getAllExpenses() {
    Id userId = UserInfo.getUserId();

    return [
        SELECT
            Id,
            Expense_Date__c,
            Expense_Type__c,
            Description__c,
            Amount__c,
            Status__c,
            Expense_Source__c,
            Distance__c,
            Vehicle_Type__c,
            Rate_Per_Km__c,
            From_Location__c,
            To_Location__c,
            Receipt_Count__c,
            City__c,
            Rejection_Reason__c,
            Submitted_On__c,
            Approved_On__c,
            CreatedBy.Name
        FROM Expense__c
        WHERE OwnerId = :userId
        ORDER BY Expense_Date__c DESC
    ];
}

    /**
     * Spend grouped by category for the budget meter (Submitted + Approved,
     * so the segments sum to the same "used" figure as getBudgetSummary).
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> getSpendByCategory() {
        Id userId = UserInfo.getUserId();
        List<Map<String, Object>> out = new List<Map<String, Object>>();
        for (AggregateResult ar : [
            SELECT Expense_Type__c type, SUM(Amount__c) total
            FROM Expense__c
            WHERE OwnerId = :userId AND Status__c IN ('Approved', 'Submitted')
            GROUP BY Expense_Type__c
            ORDER BY SUM(Amount__c) DESC
        ]) {
            out.add(new Map<String, Object>{
                'type'   => (String) ar.get('type'),
                'amount' => (Decimal) ar.get('total')
            });
        }
        return out;
    }

    /**
     * Receipt files attached to an expense, for the detail sheet thumbnail strip.
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> getExpenseReceipts(Id expenseId) {
        List<Map<String, Object>> out = new List<Map<String, Object>>();

        Set<Id> docIds = new Set<Id>();
        for (ContentDocumentLink link : [
            SELECT ContentDocumentId FROM ContentDocumentLink WHERE LinkedEntityId = :expenseId
        ]) {
            docIds.add(link.ContentDocumentId);
        }
        if (docIds.isEmpty()) return out;

        for (ContentVersion v : [
            SELECT Id, Title, FileType, FileExtension, ContentDocumentId
            FROM ContentVersion
            WHERE ContentDocumentId IN :docIds AND IsLatest = true
            ORDER BY CreatedDate DESC
        ]) {
            String ext = (v.FileType != null ? v.FileType : '').toUpperCase();
            Boolean isImg = new Set<String>{ 'PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'BMP' }.contains(ext);
            out.add(new Map<String, Object>{
                'title'       => v.Title,
                'fileType'    => v.FileType,
                'isImage'     => isImg,
                'downloadUrl' => '/sfc/servlet.shepherd/version/download/' + v.Id,
                'versionId'   => v.Id
            });
        }
        return out;
    }

@AuraEnabled(cacheable=true)
public static List<Expense__c> getRecentExpensesByMonth(Integer limitSize, Integer year, Integer month) {

    Id userId = UserInfo.getUserId();

    Date startDate = Date.newInstance(year, month, 1);
    Date endDate = startDate.addMonths(1).addDays(-1);

    return [
        SELECT Id, Name, Expense_Date__c, Expense_Type__c, Description__c, Amount__c, Status__c
        FROM Expense__c
        WHERE OwnerId = :userId
        AND Expense_Date__c >= :startDate
        AND Expense_Date__c <= :endDate
        ORDER BY Expense_Date__c DESC
        LIMIT :limitSize
    ];
}

    // ======================================================================
    // Reimbursement flow: config, create (draft), receipt upload, submit
    // ======================================================================

    /**
     * One-shot config for the submit form: active mileage rates, category
     * policies (receipt rule / cap / DA), and the user's remaining budget.
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getExpenseFormConfig() {

        Id userId = UserInfo.getUserId();

        List<Map<String, Object>> rates = new List<Map<String, Object>>();
        for (Mileage_Rate__mdt r : [
            SELECT Vehicle_Type__c, Rate_Per_Km__c
            FROM Mileage_Rate__mdt
            WHERE Active__c = true
        ]) {
            rates.add(new Map<String, Object>{
                'vehicleType' => r.Vehicle_Type__c,
                'ratePerKm'   => r.Rate_Per_Km__c
            });
        }

        List<Map<String, Object>> policies = new List<Map<String, Object>>();
        for (Expense_Policy__mdt p : [
            SELECT Expense_Type__c, Requires_Receipt__c, Daily_Cap__c, Default_DA_Amount__c
            FROM Expense_Policy__mdt
        ]) {
            policies.add(new Map<String, Object>{
                'expenseType'     => p.Expense_Type__c,
                'requiresReceipt' => p.Requires_Receipt__c,
                'dailyCap'        => p.Daily_Cap__c,
                'defaultDA'       => p.Default_DA_Amount__c
            });
        }

        Decimal monthlyBudget = 0;
        List<Expense__c> budgetRows = [
            SELECT Monthly_Budget__c
            FROM Expense__c
            WHERE OwnerId = :userId AND Monthly_Budget__c != null
            ORDER BY CreatedDate DESC
            LIMIT 1
        ];
        if (!budgetRows.isEmpty()) {
            monthlyBudget = budgetRows[0].Monthly_Budget__c;
        }

        AggregateResult ar = [
            SELECT SUM(Amount__c) total
            FROM Expense__c
            WHERE OwnerId = :userId AND Status__c IN ('Approved', 'Submitted')
        ];
        Decimal used = (Decimal) ar.get('total');
        if (used == null) used = 0;

        return new Map<String, Object>{
            'mileageRates'    => rates,
            'policies'        => policies,
            'monthlyBudget'   => monthlyBudget,
            'usedAmount'      => used,
            'remainingBudget' => monthlyBudget - used
        };
    }

    /**
     * For "Auto" mileage mode: the GPS-tracked distance rolled up on today's
     * Journey Plan (see JourneyPlanController haversine logic).
     */
    @AuraEnabled(cacheable=true)
    public static Decimal getTodayRouteDistance() {
        Id userId = UserInfo.getUserId();
        List<Journey_Plan__c> plans = [
            SELECT Total_Distance__c
            FROM Journey_Plan__c
            WHERE Plan_Date__c = TODAY AND OwnerId = :userId
            LIMIT 1
        ];
        if (!plans.isEmpty() && plans[0].Total_Distance__c != null) {
            return plans[0].Total_Distance__c;
        }
        return 0;
    }

    /**
     * Insert the expense as Draft and return its Id. Mileage amounts are
     * recomputed server-side (km x rate) so client math is never trusted.
     */
    @AuraEnabled
    public static Id createExpense(ExpenseInput input) {
        Expense__c exp = new Expense__c();
        exp.Expense_Type__c   = input.expenseType;
        exp.Expense_Source__c = input.source;
        exp.Expense_Date__c   = String.isNotBlank(input.expenseDate)
            ? Date.valueOf(input.expenseDate) : Date.today();
        exp.City__c           = input.city;
        exp.Description__c     = input.description;
        exp.Status__c          = 'Draft';
        exp.Employee__c        = UserInfo.getUserId();
        if (String.isNotBlank(input.visitId)) {
            exp.Visit__c = input.visitId;
        }

        if (input.expenseType == 'Mileage') {
            Decimal rate = getRateForVehicle(input.vehicleType);
            Decimal km   = input.distance != null ? input.distance : 0;
            exp.Distance__c      = km;
            exp.Vehicle_Type__c  = input.vehicleType;
            exp.Rate_Per_Km__c   = rate;
            exp.From_Location__c = input.fromLocation;
            exp.To_Location__c   = input.toLocation;
            exp.Amount__c        = km * rate;
        } else {
            exp.Amount__c = input.amount;
        }

        insert exp;
        return exp.Id;
    }

    private static Decimal getRateForVehicle(String vehicleType) {
        if (String.isBlank(vehicleType)) return 0;
        for (Mileage_Rate__mdt r : [
            SELECT Rate_Per_Km__c
            FROM Mileage_Rate__mdt
            WHERE Active__c = true AND Vehicle_Type__c = :vehicleType
            LIMIT 1
        ]) {
            return r.Rate_Per_Km__c != null ? r.Rate_Per_Km__c : 0;
        }
        return 0;
    }

    /**
     * Attach a receipt image (base64) to the expense and bump Receipt_Count__c.
     * Mirrors DealerDocumentUploaderController.uploadFileToSalesforce.
     */
    @AuraEnabled
    public static Id uploadReceipt(Id expenseId, String fileName, String base64Data) {
        ContentVersion cv = new ContentVersion(
            Title                  = fileName,
            PathOnClient           = fileName,
            VersionData            = EncodingUtil.base64Decode(base64Data),
            FirstPublishLocationId = expenseId
        );
        insert cv;

        Expense__c exp = [
            SELECT Id, Receipt_Count__c FROM Expense__c WHERE Id = :expenseId LIMIT 1
        ];
        exp.Receipt_Count__c = (exp.Receipt_Count__c == null ? 0 : exp.Receipt_Count__c) + 1;
        update exp;

        return [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id].ContentDocumentId;
    }

    /**
     * Submit a draft expense. Enforces mandatory receipts per category policy.
     */
    @AuraEnabled
    public static void submitExpense(Id expenseId) {
        Expense__c exp = [
            SELECT Id, Expense_Type__c, Receipt_Count__c, Status__c
            FROM Expense__c WHERE Id = :expenseId LIMIT 1
        ];

        Boolean requiresReceipt = true;
        for (Expense_Policy__mdt p : [
            SELECT Requires_Receipt__c
            FROM Expense_Policy__mdt
            WHERE Expense_Type__c = :exp.Expense_Type__c
            LIMIT 1
        ]) {
            requiresReceipt = p.Requires_Receipt__c;
        }

        if (requiresReceipt && (exp.Receipt_Count__c == null || exp.Receipt_Count__c == 0)) {
            throw new AuraHandledException('At least one receipt is required to submit this expense.');
        }

        exp.Status__c       = 'Submitted';
        exp.Submitted_On__c = System.now();
        update exp;
    }

    public class ExpenseInput {
        @AuraEnabled public String expenseType   { get; set; }
        @AuraEnabled public String source         { get; set; }
        @AuraEnabled public Decimal amount        { get; set; }
        @AuraEnabled public Decimal distance      { get; set; }
        @AuraEnabled public String vehicleType    { get; set; }
        @AuraEnabled public Decimal ratePerKm     { get; set; }
        @AuraEnabled public String fromLocation   { get; set; }
        @AuraEnabled public String toLocation     { get; set; }
        @AuraEnabled public String expenseDate    { get; set; }
        @AuraEnabled public String city           { get; set; }
        @AuraEnabled public String visitId        { get; set; }
        @AuraEnabled public String description    { get; set; }
    }

}