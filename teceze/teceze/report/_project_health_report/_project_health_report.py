# Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
from hashlib import new
import frappe
import json
import pandas as pd

current_db_name = frappe.conf.get("db_name")

def execute(filters=None):
    if filters.get('analysis') != "Log Analysis":
        data = []
        columns = []
        project = filters.project
        message = get_messages()
        if project:
            if filters.get('analysis') == "Summarized View":
                data = get_summarized_view(project)
                columns = get_summarized_cols()
                return columns, data

            if filters.get('analysis') == "Project P&L Teceze":
                from teceze.teceze.report._project_p_and_l_report._project_p_and_l_report import getColumns, pro_data, get_message, get_pro_data
                data = get_pro_data(filters)
                column = getColumns(filters)
                message = get_message()
                return column, data, message

            else:
                columns = getColumn(filters.get('show_tags'),filters.get('en_var'))
                # project_name = frappe.db.get_value(
                #     'Project', project, 'project_name')
                if project:
                    project_name = frappe.db.get_list("Project",filters={"name":project},fields={"project_name","percent_complete"})
                val = json.dumps({'project': project})
                button = f'''<span  data='%s' title="Add Task" style="color:#0088ff" onclick='add_task(this.getAttribute("data"))'><svg xmlns="http://www.w3.org/2000/svg"
                            width="16" height="16" fill="currentColor" class="bi bi-plus-circle" viewBox="0 0 16 16">
                    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                                        <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
                                        </svg></span>''' % (val)

                # project_dic = {'subject': project_name,
                #             'task': project + '&nbsp &nbsp' + button}
                
                # project_dic = {'subject': project_name,
                #                'task': '<a href="' + frappe.utils.get_url() + '/app/project/' + project + '"' + 'target="_blank"' + '>' + project + '</a>' + '&nbsp &nbsp' + button}
                
                
                if project_name:
                    project_dic = {'subject': project_name[0]['project_name'],"prog_bar":get_progress_bar(project_name[0]['percent_complete']),
                            'task': '<a href="' + frappe.utils.get_url() + '/app/project/' + project + '"' + 'target="_blank"' + '>' + project + '</a>' + '&nbsp &nbsp' + button}
                
                data, tot_logged_hours, tot_expec_hrs = get_data(project)
                type_count = frappe.db.sql('''
                                        select status,count(*) as count from tabTask where project = '{0}' group by status;
                                    '''.format(project), as_dict=True)

                sum_count = []
                for item in type_count:
                    sum_count.append(item['count'])

                type_count.append({'status': 'Total', 'count': sum(sum_count)})
                # report_summary = get_report_summary(type_count, tot_logged_hours, tot_expec_hrs, project,
                # filters.hide_dates)
                data.insert(0, project_dic)
                total_pos = len(data)-1
                # frappe.msgprint(str(project_dic)+"-project_dic['expected_hrs']")
                # frappe.msgprint(str(data[total_pos]['expected_hrs'])+"-data[total_pos]['expected_hrs']")
                project_dic['expected_hrs'] = data[total_pos].get('expected_hrs')
                project_dic['hrs'] = data[total_pos].get('hrs')
                data.pop()
                # frappe.log_error("data",str)
                return columns, data, message
        else:
            return columns, data, message

    if filters.get('analysis') == "Log Analysis":
        try:
            columns = get_columns(filters)
            data = get_prject_log_data(filters)
            return columns, data
        except Exception as e:
            raise e


# complete year timesheet
months = {
    1: 'Jan',
    2: 'Feb',
    3: 'Mar',
    4: 'Apr',
    5: 'May',
    6: 'Jun',
    7: 'Jul',
    8: 'Aug',
    9: 'Sep',
    10: 'Oct',
    11: 'Nov',
    12: 'Dec'
}


def get_columns(filters):
    try:
        columns = [
            {"label": "<b>Employee</b>", "fieldname": "employee",
                "fieldtype": "Data", "options": "Employee", "width": 250, "align": "center"},

            {"label": "<b>custom_division</b>", "fieldname": "custom_division",
                "fieldtype": "Data", "width": 180, "align": "center"},
        ]
        if filters['project']:
            project_data = frappe.db.sql("""SELECT month(expected_start_date) as start_month,month(expected_end_date) as end_month,expected_start_date,expected_end_date,
                                         year(expected_start_date) as start_year,year(expected_end_date) as end_year FROM `tabProject`
                                         WHERE name='{project_name}'""".format(project_name=filters.get('project')), as_dict=1)

            project_data = project_data[0]

            sd = str(project_data['start_year'])+"-" + \
                str(project_data['start_month'])+"-"+"01"
            ed = project_data['expected_end_date']
            if (sd != None and ed != None):
                for i in pd.date_range(start=sd, end=ed, freq='MS'):
                    col = {"label": "<b>" + str(i.strftime("%b-%y")) + "</b>", "fieldname": str(i.strftime("%b_%y")).lower(),
                           "fieldtype": "data", "width": 90, "align": "center"}
                    columns.append(col)

        # for d in range(project_data['start_month'],project_data['end_month']):
        #     filter_year = str(project_data['start_year'])
        #     filter_year = filter_year[2:]
        #     if d=='Jan' or d=='Feb' or d=='Mar':
        #         filter_year = str(int(filter_year)+1)
        #         month_label_name = d+' '+filter_year
        #     month_label_name = months[d]+' '+filter_year
        #     month_field = months[d]
        #     columns.append(
        #         {"label": month_label_name, "fieldname": month_field.lower(),
        #         "fieldtype": "Link", "options": "Employee", "width": 130, "align": "center"},
        #     )
        columns.append({"label": "<b>Total</b>", "fieldname": "tot",
                        "fieldtype": "Float", "width": 100, "align": "center"},)
        return columns
    except Exception as e:
        raise e


def get_prject_log_data(filters):
    try:
        project_data = frappe.db.sql("""SELECT month(expected_start_date) as start_month,expected_start_date,expected_end_date,month(expected_end_date) as end_month,
                                            year(expected_start_date) as start_year,year(expected_end_date) as end_year FROM `tabProject`
                                            WHERE name='{0}'""".format(filters.get('project')), as_dict=1)

        project_data = project_data[0]
        if filters.get("project") and project_data['expected_start_date'] and project_data['expected_end_date']:
            data = frappe.db.sql("""SELECT e.employee,e.employee_name,e.status,t.custom_division as custom_division,t.start_date,month(t.start_date) as month_wise,
                        year(t.start_date) as year_wise,td.project_name,td.project,td.task,sum(td.hours) as hours 
                        FROM {0}.`tabEmployee` e INNER JOIN {0}.`tabTimesheet` t ON t.employee=e.employee
                        INNER JOIN `tabTimesheet Detail` td ON td.parent=t.name WHERE td.project='{1}'and 
                        t.docstatus=1 and date(td.creation) > "{2}" and date(td.creation) < "{3}" group by e.employee,td.project,month_wise,year_wise;""".format(current_db_name, filters.get("project"), project_data['expected_start_date'], project_data['expected_end_date']),as_dict=1)
            
            
            if len(data)>0:
                data = grouping_data(data, "employee", filters)
                return data
    except Exception as e:
        raise e
def grouping_data(input_list, parameter, filters):
    import pandas as pd
    try:
        parentChildMap = {}
        for b in input_list:
            parentChildMap.setdefault(b[parameter] or None, []).append(b)
        log_hours = []
        for d in parentChildMap:
            emp = {}
            emp['employee'] = d
            employee = d
            emp['tot'] = 0
            for i in parentChildMap[d]:
                status = i['status']
                custom_division = i['custom_division']
                employee_name = i["employee_name"]
                month_wise = months[i['month_wise']]
                year_wise = str(i['year_wise'])
                year_wise = year_wise[2:]
                month_wise = month_wise.lower()+"_"+year_wise
                emp['tot'] += i['hours']
                emp[month_wise] = i['hours']
            emp['employee_name'] = employee_name
            emp['custom_division'] = custom_division
            emp['status'] = status
            if not status == 'Left':
                emp['employee'] = '<a href="' + frappe.utils.get_url() + '/app/employee/' + \
                    d+'"' + 'target="_blank"' + '>' + d+": "+employee_name + '</a>'
            else:
                emp['employee'] = '<a style=color:#fb0b0b; href="' + frappe.utils.get_url(
                ) + '/app/employee/' + d+'"' + 'target="_blank"' + '>' + d+": "+employee_name + '</a>'
            log_hours.append(emp)
        df_set = pd.DataFrame(log_hours)
        del df_set["employee"]
        del df_set["employee_name"]
        del df_set["custom_division"]
        data = df_set.sum()
        total = {}
        total['employee'] = 'Total'
        total.update(data)
        log_hours.append(total)

        return log_hours
    except Exception as e:
        raise e



def get_messages() -> str:
    # <span style="color:#ff8844;border-left: 2px solid;padding-right: 10px; padding-left: 10px;"><span style="color:#ff8844; opacity: 1.0;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus-circle" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg> Add QC Defect</span>
    message = ""
    message += f"""
    <span style="color:darkviolet">Legend : </span>
    <span style="padding-right: 10px;"><span style="opacity: 1.0;"> <b>SD Variance</b> - Start Date Variance</span><span style="opacity: 1.0;margin-left:10px;padding-left:10px;border-left: 2px solid;"><b>ED Variance</b> - End Date Variance </span></span>
    <span style="color:#0088ff;border-left: 2px solid;padding-right: 10px; padding-left: 10px;"><span style="color:#0088ff; opacity: 1.0;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus-circle" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>   New Task </span></span>
    <span style="color:#2f9d58;border-left: 2px solid;padding-right: 10px; padding-left: 10px;"><span style="color:#2f9d58; opacity: 1.0;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"fill="currentColor" class="bi bi-plus-circle" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>  New Child Task </span></span>
    """
    return message
# end


def get_data(project):
    par_child_data = []
    total_hours = None
    tot_expec_hrs = None
    if project is not None:
        data = frappe.db.sql('''
                            select progress,round(actual_time,2) as hrs, round(expected_time,2) as expected_hrs,name as task,parent_task,subject, 
                             _assign, SUBSTR(_user_tags, 2) as tags,custom_division,type,priority,status,is_group,exp_start_date,act_start_date,
                            datediff(act_start_date,exp_start_date) as start_diff,exp_end_date,act_end_date,datediff(act_end_date,exp_end_date) as end_diff
                            # case when connected_to is not null then connected_to else parent_task end as parent_task
                            from `tabTask` where project='{}' and (status!="Cancelled" or actual_time>0) order by subject;'''
                             .format(project), as_dict=True)
    
        data = frappe.db.sql('''
                            SELECT 
                                
                                t.progress,
                                count(f.name) as attachements,
                                ROUND(t.actual_time, 2) as hrs,
                                ROUND(t.expected_time, 2) as expected_hrs,
                                t.name as task,
                                t.parent_task,
                                t.subject,
                                t._assign,
                                SUBSTR(t._user_tags, 2) as tags,
                                t.custom_division,
                                t.type,
                                t.priority,
                                t.status,
                                t.is_group,
                                t.exp_start_date,
                                t.act_start_date,
                                DATEDIFF(t.act_start_date, t.exp_start_date) as start_diff,
                                t.exp_end_date,
                                t.act_end_date,
                                DATEDIFF(t.act_end_date, t.exp_end_date) as end_diff
                            FROM 
                                `tabTask` t
                            LEFT JOIN 
                                `tabFile` f ON t.name = f.attached_to_name
                            WHERE 
                                t.project = '{}'
                                AND (t.status != 'Cancelled' OR t.actual_time > 0)
                            GROUP BY 
                                t.progress, t.name, t.parent_task, 
                                t.subject, t._assign,  t.custom_division, t.type, t.priority, 
                                t.status, t.is_group, t.exp_start_date, t.act_start_date, 
                                t.exp_end_date, t.act_end_date
                            ORDER BY 
                                t.subject;'''
                             .format(project), as_dict=True)

        if data:
            par_child_data, total_hours, tot_expec_hrs = main(data)
            for p in par_child_data:
                val = json.dumps({'project': project, 'task': p['task']})
                if p['is_group'] == 1 and p['status'] != "Cancelled":
                    p['task'] = '<a href="' + frappe.utils.get_url() + '/app/task/' + p[
                        'task'] + '"' + 'target="_blank"' + '>' + p['task'] + '</a>'
                    button = f'''<span data='%s' title="Add Child" style="color:#2f9d58" onclick='add_child(this.getAttribute("data"))'><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                                    fill="currentColor" class="bi bi-plus-circle" viewBox="0 0 16 16">
                                    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                                    <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
                                    </svg></span>''' % (val)
                    # button2 = f'''<span data='%s' title="Add QC Defect" style="color:#ff8844" onclick='add_qc_defect(this.getAttribute("data"))'><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                    #                 fill="currentColor" class="bi bi-plus-circle" viewBox="0 0 16 16">
                    #                 <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                    #                 <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
                    #                 </svg></span>''' % (val)
                    p['task'] = p['task'] + '&nbsp &nbsp' + button
                else:
                    val = json.dumps({'project': project, 'task': p['task']})
                    p['task'] = '<a href="'+frappe.utils.get_url()+'/app/task/' + p[
                        'task'] + '"' + 'target="_blank"' + '>' + p['task'] + '</a>'

            total_hours = round(total_hours, 2)
            tot_expec_hrs = round(tot_expec_hrs, 2)
            if total_hours>tot_expec_hrs:
                total_hours = "<span style='color:red'>"+str(total_hours)+"</span>"
            par_child_data.append(
                {'indent': 0, 'subject': '<b>' + 'Total' + '</b>', 'hrs': '<b>' + str(total_hours) + '</b>',
                 'expected_hrs': '<b>' + str(tot_expec_hrs) + '</b>',"is_parent_project":1})

            # par_child_data = sorted(par_child_data, key=lambda d: d['subject'])
    return par_child_data, total_hours, tot_expec_hrs


def main(list1):
    total = 0
    tot_expected_hrs = 0
    new_list = []
    new_dic = {}
    org_set = set()

    for d in list1:
        new_dic.update({d['task']: d})
        org_set.add(d['task'])

    par_child_map = getParentMap(list1, 'parent_task')

    for p in par_child_map:
        if p is None:
            for a in par_child_map[p]:
                new_dic[a]['indent'] = 0
                if new_dic[a]['hrs'] is not None:
                    total += new_dic[a]['hrs']
                if new_dic[a]['expected_hrs'] is not None:
                    tot_expected_hrs += new_dic[a]['expected_hrs']
                    
                new_dic[a]['is_parent'] = 0
                new_dic[a]['prog_bar'] = get_progress_bar(new_dic[a].get('progress'))
                new_list.append(new_dic[a])

        elif p == '':
            for c in par_child_map[p]:
                new_dic[c]['indent'] = 0
                if new_dic[c]['hrs'] is not None:
                    total += new_dic[c]['hrs']
                if new_dic[c]['expected_hrs'] is not None:
                    tot_expected_hrs += new_dic[c]['expected_hrs']
                    
                new_dic[c]['is_parent'] = 0
                new_dic[c]['prog_bar'] = get_progress_bar(new_dic[c].get('progress'))
                
                new_list.append(new_dic[c])

        else:
            pos = get_pos(new_list, p)
            if pos > 0:
                #added for least and most date for parent
                parent_position = 0
                temp_dict = []
                log_hours = 0
                expected_hrs = 0
                count = 0
                #end
                for i, b in list(enumerate(par_child_map[p])):
                    count += 1
                    for j in new_dic:
                        if p == j:
                            new_dic[b]['indent'] = new_dic[j]['indent'] + 1

                    if new_dic[b]['hrs'] is not None:
                        total += new_dic[b]['hrs']
                    if new_dic[b]['expected_hrs'] is not None:
                        tot_expected_hrs += new_dic[b]['expected_hrs']
                    
                    new_dic[b]['prog_bar'] = get_progress_bar(new_dic[b].get('progress'))
                    new_dic[b]['is_parent'] = 0
                    # frappe.msgprint(str(new_dic[b]))
                    #added for least and most date for parent
                    if count == 1:
                        parent_position = i + pos + 1
                        parent_position = parent_position-1
                    if new_dic[b]['exp_end_date']==None or new_dic[b]['exp_start_date']==None:
                        pass
                    else:
                        temp_dict.append(new_dic[b])
                    #end 
                    new_list.insert(i + pos + 1, new_dic[b])
                      
#------------------------new changes------------------------------------------------------------------------------------------
                if new_list[parent_position]['parent_task']:
                    parent_pos = get_pos(new_list, new_list[parent_position]['parent_task'])
                    if parent_pos:
                        new_list[parent_pos]['is_parent'] = 1
                        new_list[parent_position]['is_parent'] = 1
                        
                else:
                    new_list[parent_position]['is_parent'] = 1
                    
                # for most and least dates and also for status
                exp_start_date = sorted(temp_dict, key=lambda i: (i.get('exp_start_date')))
                if len(exp_start_date)>0:
                    new_list[parent_position]['exp_start_date'] = exp_start_date[0]['exp_start_date']
                    new_list[parent_position]['act_start_date'] = exp_start_date[0]['exp_start_date']
                    
                exp_end_date = sorted(temp_dict, key=lambda i: (i['exp_end_date']),reverse=True)
                if len(exp_end_date)>0:
                    new_list[parent_position]['exp_end_date'] = exp_end_date[0]['exp_end_date']
                    new_list[parent_position]['act_end_date'] = exp_start_date[0]['exp_end_date']
                
                from collections import Counter
                c = Counter()
                for item in temp_dict:
                    c[item["status"]] += 1

                from pprint import pprint
                value = {k: v for k, v in c.items()}
                
                if value:
                    parent_status = ""
                    if value.get('open') and value.get('open')>0:
                        parent_status = "Open"
                    if value.get('Working') and value.get('Working')>0:
                        parent_status = "Working"
                        
                    if len(temp_dict)==value.get('Completed'):
                        parent_status= "Completed"
                    
                    if len(temp_dict)==value.get('Cancelled'):
                        parent_status= "Cancelled"
                        
                    # parent_status = str(max(value, key = lambda x: value[x]))
                    if parent_status:
                        new_list[parent_position]['status'] = parent_status
                
#------------------------new changes end -----------------------------------------------------------------------------------------------------

    N = 0
    while (len(new_list) < len(list1)) and (N < 6):
        new_set = set()
        for q in new_list:
            new_set.add(q['task'])

        diff_list = list(org_set - new_set)
        diff_list.sort(reverse=True)

        for k in diff_list:
            val = new_dic[k]
            for i, v in list(enumerate(new_list)):
                if val['parent_task'] == v['task']:
                    val['indent'] = v['indent'] + 1
                    if val['hrs'] is not None:
                        total += val['hrs']
                    if val['expected_hrs'] is not None:
                        tot_expected_hrs += val['expected_hrs']

                    val['prog_bar'] = get_progress_bar(val.get('progress'))
                    new_list[i]['is_parent'] = 1
                    new_list.insert(i + 1, val)

        N += 1
        # Sort by jeci
        # new_list=(sorted(new_list, key=lambda i: i['subject']))
    

    # if new_list:
    #     parentChildMap = {}
    #     for b in new_list:
    #         if b.get('parent_task')=='None' or b.get('parent_task')=='' or b.get('parent_task')==None:
    #             if b.get('task'):
    #                 parentChildMap[b['task']]=[]
    #                 parentChildMap[b['task']].append(b)

    #         if b.get('parent_task') and b.get("parent_task")!="None" and b.get('parent_task') !='' and b.get('parent_task') !=None:
    #             if b['parent_task'] in parentChildMap:
    #                 parentChildMap[b['parent_task']].append(b)
    #             else:
    #                 parentChildMap[b['parent_task']] = []
    #                 parentChildMap[b['parent_task']].append(b)

    #     final_dict = []
    #     for d in parentChildMap:
    #         if len(parentChildMap[d])>0:
    #             second_dict = {}
    #             for g in parentChildMap[d]:
    #                 second_dict.setdefault(g['indent'] or None, []).append(g)

    #             # print(second_dict)
    #             for l in second_dict:
    #                 if l==None:
    #                     for bn in second_dict[l]:
    #                         final_dict.append(bn)

    #                 else:
    #                     new_list=(sorted(second_dict[l], key=lambda i: i['subject']))
    #                     for hn in new_list:
    #                         final_dict.append(hn)
    #                         if parentChildMap[hn]:
    #                             for jh in parentChildMap[hn]:
    #                                 final_dict.append(jh)
    #                             del parentChildMap[hn]
    # if final_dict:
    #     # del final_dict[0]
    #     return final_dict, total, tot_expected_hrs
    return new_list, total, tot_expected_hrs


def get_progress_bar(width):
    prog_bar = ''
    prog_bar += '<div class="list-row-col ellipsis hidden-xs text-right" style="padding-top:2px;padding-left:8px">'
    prog_bar += '<span class="ellipsis" title="'+ str(width)+'% Completed">'
    prog_bar +=	'<a class="filterable ellipsis" data-filter="per_ordered,=,">'
    prog_bar +=	'<div class="progress" style="margin: 0px;">'
    # if width==100.0:
    #     prog_bar +=	'<div class="progress-bar progress-bar-success" role="progressbar" aria-valuenow="" aria-valuemin="0" aria-valuemax="100" style="width:'+ str(width)+'%;opacity:0.4;background-color:#2693ec !important">'
    # else:
    #     prog_bar +=	'<div class="progress-bar progress-bar-success" role="progressbar" aria-valuenow="" aria-valuemin="0" aria-valuemax="100" style="width:'+ str(width)+'%;background-color:#2693ec !important">'
    
    if width==100.0:
        prog_bar +=	'<div class="progress-bar progress-bar-success" role="progressbar" aria-valuenow="" aria-valuemin="0" aria-valuemax="100" style="width:'+ str(width)+'%;opacity:0.3;">'
    else:
        prog_bar +=	'<div class="progress-bar progress-bar-success" role="progressbar" aria-valuenow="" aria-valuemin="0" aria-valuemax="100" style="width:'+ str(width)+'%;">'
    
    prog_bar +=	'</div>'
    prog_bar +=	'</div>'
    prog_bar +=	'</a>'
    prog_bar +=	'</span>'
    prog_bar +=	'</div>'
    return prog_bar

def main1(list1):
    total = 0
    tot_expected_hrs = 0
    new_list = []

    new_dic = {}
    org_set = set()

    for d in list1:
        new_dic.update({d['task']: d})
        org_set.add(d['task'])

    par_child_map = getParentMap(list1, 'parent_task')

    none_parent_set = set()
    for a in par_child_map[None]:
        new_dic[a]['indent'] = 0
        new_list.append(new_dic[a])
        none_parent_set.add(a)

    for p in par_child_map:
        if p is None:
            pass

        elif p == '':
            for c in par_child_map[p]:
                new_dic[c]['indent'] = 0
                if new_dic[c]['hrs'] is not None:
                    total += new_dic[c]['hrs']
                if new_dic[c]['expected_hrs'] is not None:
                    tot_expected_hrs += new_dic[c]['expected_hrs']
                new_list.append(new_dic[c])

        else:
            if not p in none_parent_set:
                pos = get_pos(new_list, p)
                if pos > 0:
                    for i, b in list(enumerate(par_child_map[p])):
                        for j in new_dic:
                            if p == j:
                                new_dic[b]['indent'] = new_dic[j]['indent'] + 1

                        if new_dic[b]['hrs'] is not None:
                            total += new_dic[b]['hrs']
                        if new_dic[b]['expected_hrs'] is not None:
                            tot_expected_hrs += new_dic[b]['expected_hrs']

                        new_list.insert(i + pos + 1, new_dic[b])

    N = 0
    while (len(new_list) < len(list1)) and (N < 6):
        new_set = set()
        for q in new_list:
            new_set.add(q['task'])

        diff_list = list(org_set - new_set)
        diff_list.sort(reverse=True)

        for k in diff_list:
            val = new_dic[k]
            for i, v in list(enumerate(new_list)):
                if val['parent_task'] == v['task']:
                    val['indent'] = v['indent'] + 1
                    if val['hrs'] is not None:
                        total += val['hrs']
                    if val['expected_hrs'] is not None:
                        tot_expected_hrs += val['expected_hrs']

                    new_list.insert(i + 1, val)

        N += 1

    return new_list, total, tot_expected_hrs


def get_pos(new_list_data, par_task):
    pos = 0
    for d in range(0, len(new_list_data)):
        if new_list_data[d]['task'] == par_task:
            return d
    return pos


def get_report_summary(type_data, logged_hours, expec_hrs, project, hide_date):
    report_summary = []

    for tc in type_data:
        val = 0
        if tc['status'] == 'Open':
            val = "<span style='color:#f8814f!important; opacity: 0.8;'>" + \
                str(tc['count']) + "</span>"

        elif tc['status'] == 'Working':
            val = "<span style='color:#f8814f!important;'>" + \
                str(tc['count']) + "</span>"

        elif tc['status'] == 'Pending Review':
            val = "<span style='color:#f8814f!important; text-bold'>" + \
                str(tc['count']) + "</span>"

        elif tc['status'] == 'Overdue':
            val = "<span style='color:#e24c4c!important;'>" + \
                str(tc['count']) + "</span>"

        elif tc['status'] == 'Completed':
            val = "<span style='color:#2f9d58!important;'>" + \
                str(tc['count']) + "</span>"

        elif tc['status'] == 'Cancelled':
            val = "<span style='color:#333c44!important;'>" + \
                str(tc['count']) + "</span>"

        elif tc['status'] == 'Total':
            val = "<span style='color:#333c44!important;'>" + \
                str(tc['count']) + "</span>"

        elif tc['status'] == 'Template':
            val = "<span style='color:#333c44!important;'>" + \
                str(tc['count']) + "</span>"

        report_summary.append(
            {'label': '<b>' + tc['status'] + ' Tasks' + '</b>', 'value': val})

    report_summary.append(
        {'label': '<b>' + 'Logged Hrs' + '</b>', 'value': logged_hours})
    report_summary.append(
        {'label': '<b>' + 'Expected Hrs' + '</b>', 'value': expec_hrs})

    if not hide_date:
        proj_data = frappe.db.sql('''SELECT expected_start_date,actual_start_date,
                                expected_end_date,actual_end_date from tabProject where name = '{}';'''.format(project),
                                  as_dict=True)

        if proj_data:
            proj_data = proj_data[0]
            report_summary.append({'label': '<i>' + 'Expected Start Date' + '</i>', 'value':
                                   "<span style='font-size:15px!important;'>" + str(proj_data['expected_start_date']) + "</span>"})

            if proj_data['expected_start_date'] and proj_data['actual_start_date']:
                if proj_data['expected_start_date'] > proj_data['actual_start_date']:
                    report_summary.append({'label': 'Actual Start Date', 'value':
                                           "<span style='color:green;font-size:15px;!important; opacity: 0.8;'>" + str(
                                               proj_data['actual_start_date']) + "</span>"})
                else:
                    report_summary.append({'label': 'Actual Start Date', 'value':
                                           "<span style='color:red;font-size:15px;!important; opacity: 0.8;'>" + str(
                                               proj_data['actual_start_date']) + "</span>"})

                report_summary.append({'label': '<i>' + 'Expected End Date' + '</i>', 'value':
                                       "<span style='font-size:15px!important;'>" + str(proj_data['expected_end_date']) + "</span>"})

                if proj_data['expected_end_date'] > proj_data['actual_end_date']:
                    report_summary.append({'label': 'Actual End Date', 'value':
                                           "<span style='color:green;font-size:15px;!important; opacity: 0.8;'>" + str(
                                               proj_data['actual_end_date']) + "</span>"})
                else:
                    report_summary.append({'label': 'Actual End Date', 'value':
                                           "<span style='color:red;font-size:15px;!important; opacity: 0.8;'>" + str(
                                               proj_data['actual_end_date']) + "</span>"})

    return report_summary


def get_summarized_view(project):
    # Get Count based on Activity type
    data = frappe.db.sql('''
                        SELECT type as Type,count(case when status= 'Open' Then 1 else null end) as 'Open',
                        count(case when status= 'Working' Then 1 else null end) as 'Working',
                        count(case when status= 'Pending Review' Then 1 else null end) as 'Pending Review',
                        count(case when status= 'Overdue' Then 1 else null end) as 'Overdue',
                        count(case when status= 'Completed' Then 1 else null end) as 'Completed',
                        count(case when status= 'Cancelled' Then 1 else null end) as 'Cancelled',
                        count(*) as Total
                        FROM tabTask where project='{}' group by type;
                         '''.format(project), as_dict=True)
    # Get Total Count
    total_count = frappe.db.sql('''
                        SELECT count(case when status= 'Open' Then 1 else null end) as 'Open',
                        count(case when status= 'Working' Then 1 else null end) as 'Working',
                        count(case when status= 'Pending Review' Then 1 else null end) as 'Pending Review',
                        count(case when status= 'Overdue' Then 1 else null end) as 'Overdue',
                        count(case when status= 'Completed' Then 1 else null end) as 'Completed',
                        count(case when status= 'Cancelled' Then 1 else null end) as 'Cancelled',
                        count(*) as Total
                        FROM tabTask where project='{}';'''.format(project), as_dict=True)

    total_count = total_count[0]
    total_count['Type'] = '<b>' + 'Total' + '</b>'
    total_count['Open'] = '<b>' + str(total_count['Open']) + '</b>'
    total_count['Completed'] = '<b>' + str(total_count['Completed']) + '</b>'
    total_count['Working'] = '<b>' + str(total_count['Working']) + '</b>'
    total_count['Overdue'] = '<b>' + str(total_count['Overdue']) + '</b>'
    total_count['Cancelled'] = '<b>' + str(total_count['Cancelled']) + '</b>'
    total_count['Pending Review'] = '<b>' + \
        str(total_count['Pending Review']) + '</b>'
    total_count['Total'] = total_count['Total']

    if data:
        data.append(total_count)
        return data
    else:
        return []


def get_summarized_cols():
    columns = [
        {"label": "<b>Type</b>", "fieldname": "Type",
            "fieldtype": "Data", "width": 150},
        {"label": "<b>Open</b>", "fieldname": "Open",
            "fieldtype": "Data", "width": 100},
        {"label": "<b>Working</b>", "fieldname": "Working",
            "fieldtype": "Data", "width": 100},
        {"label": "<b>Pending Review</b>", "fieldname": "Pending Review",
            "fieldtype": "Data", "width": 100},
        {"label": "<b>Overdue</b>", "fieldname": "Overdue",
            "fieldtype": "Data", "width": 100},
        {"label": "<b>Completed</b>", "fieldname": "Completed",
            "fieldtype": "Data", "width": 100},
        {"label": "<b>Cancelled</b>", "fieldname": "Cancelled",
            "fieldtype": "Data", "width": 100},
        {"label": "<b>Total</b>", "fieldname": "Total",
            "fieldtype": "Data", "width": 100}
    ]
    return columns


def getParentMap(input_list, parameter):
    parentChildMap = {}
    for b in input_list:
        parentChildMap.setdefault(b[parameter] or None, []).append(b['task'])
    return parentChildMap

def getColumn(tag_fil,en_var):
    columns = [
        {"label": "<b>Task</b>", "fieldname": "subject",
            "fieldtype": "Data", "width": 250, "align": "center"},
        
        {"label": "<b>Task ID</b>", "fieldname": "task",
            "fieldtype": "Data", "width": 180, "align": "center"},
        
        {"label": "<b>Division</b>", "fieldname": "custom_division",
            "fieldtype": "Data", "width": 110, "align": "center"},
        
        {"label": "<b>Priority</b>", "fieldname": "priority",
            "fieldtype": "Data", "width": 70, "align": "center"},

        {"label": "<b>Status</b>", "fieldname": "status",
            "fieldtype": "Data", "width": 100, "align": "center"},
        
        {"label": "<b>Progress(%)</b>", "fieldname": "prog_bar",
            "fieldtype": "HTML", "width": 180, "align": "center"},
        
        {"label": "<b>Assigned With</b>", "fieldname": "_assign",
            "fieldtype": "Image", "width": 150, "align": "center"},

        {"label": "<b>Attachments</b>", "fieldname": "attachements",
            "fieldtype": "int", "width": 130, "align": "center"},
        
        {"label": "<b>Exp.Hrs</b>", "fieldname": "expected_hrs",
            "fieldtype": "Data", "width": 70, "align": "center"},
        
        {"label": "<b>Log.Hrs</b>", "fieldname": "hrs",
            "fieldtype": "Data", "width": 70, "align": "center"},

        {"label": "<b>Exp.Start Date</b>",
            "fieldname": "exp_start_date", "fieldtype": "Data", "width": 100, "align": "center"},
        
       {"label": "<b>Act.Start Date</b>", "fieldname": "act_start_date",
            "fieldtype": "Data", "width": 100, "align": "center"},

        {"label": "<b>Exp.End Date</b>", "fieldname": "exp_end_date",
            "fieldtype": "Data", "width": 100, "align": "center"},
        
        
        {"label": "<b>Act.End Date</b>", "fieldname": "act_end_date",
            "fieldtype": "Data", "width": 100, "align": "center"},
        
          {"label": "<b>Type</b>", "fieldname": "type",
            "fieldtype": "Data", "width": 90, "align": "center"},
        
    ]
    if en_var:
       
        
        columns.insert(11,{"label": "<b>SD Variance</b>", "fieldname": "start_diff",
        "fieldtype": "Data", "width": 80, "align": "center"})
        
        columns.insert(14, {"label": "<b>ED Variance</b>", "fieldname": "end_diff",
            "fieldtype": "Data", "width": 80, "align": "center"})
    if tag_fil:
        columns.insert(5, {"label": "<b>Tags</b>", "fieldname": "tags",
                           "fieldtype": "Data", "width": 110, "align": "center"})

    return columns

@frappe.whitelist()
def get_user_image():
    try:
        data = frappe.db.sql(
            '''select name,full_name as fullname,user_image as image from {0}.`tabUser` ;'''.format(
                current_db_name),
            as_dict=True)
        return data
    except Exception as e:
        pass


@frappe.whitelist()
def get_status():
    doc = frappe.get_doc(
        {"doctype": 'Task', "__islocal": 1,
            "owner": frappe.session.user, "docstatus": 0}
    )
    for df in doc.meta.get("fields"):
        if df.fieldname == "status":
            return df.options



