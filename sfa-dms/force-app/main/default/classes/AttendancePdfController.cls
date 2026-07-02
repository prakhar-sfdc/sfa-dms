public with sharing class AttendancePdfController {

    public Attendance__c att { get; set; }

    public AttendancePdfController() {
        Id attId = ApexPages.currentPage().getParameters().get('id');

        att = [
            SELECT Id, Attendance_Date__c, Status__c,
                   Check_In_Time__c, Check_Out_Time__c,
                   Check_In_Address__c, Check_Out_Address__c,
                   Check_In_Latitude__c, Check_In_Longitude__c,
                   Check_Out_Latitude__c, Check_Out_Longitude__c,
                   Work_Duration__c
            FROM Attendance__c
            WHERE Id = :attId
            LIMIT 1
        ];
    }
}