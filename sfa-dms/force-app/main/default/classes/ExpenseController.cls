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
            CreatedBy.Name
        FROM Expense__c
        WHERE OwnerId = :userId
        ORDER BY Expense_Date__c DESC
    ];
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



}