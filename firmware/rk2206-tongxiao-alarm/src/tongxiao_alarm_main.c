#include "tongxiao_alarm.h"

#include <stdio.h>

#include "los_task.h"
#include "ohos_init.h"

static void AlarmOutputTask(void *arg)
{
    (void)arg;
    AlarmController_Init();
    AlarmButtons_Init();
    while (1) {
        AlarmController_Tick(100);
        AlarmButtons_Tick(100);
        LOS_Msleep(100);
    }
}

static void AlarmNetworkTask(void *arg)
{
    (void)arg;
    LOS_Msleep(800);
    AlarmMqtt_Run();
}

static void TongxiaoAlarmStart(void)
{
    unsigned int output_task_id;
    unsigned int network_task_id;
    TSK_INIT_PARAM_S output_task = {0};
    TSK_INIT_PARAM_S network_task = {0};

    output_task.pfnTaskEntry = (TSK_ENTRY_FUNC)AlarmOutputTask;
    output_task.uwStackSize = 24 * 1024;
    output_task.pcName = "tongxiao_alarm_output";
    output_task.usTaskPrio = 20;
    if (LOS_TaskCreate(&output_task_id, &output_task) != LOS_OK) {
        printf("Failed to create alarm output task\n");
        return;
    }

    network_task.pfnTaskEntry = (TSK_ENTRY_FUNC)AlarmNetworkTask;
    network_task.uwStackSize = 64 * 1024;
    network_task.pcName = "tongxiao_alarm_mqtt";
    network_task.usTaskPrio = 24;
    if (LOS_TaskCreate(&network_task_id, &network_task) != LOS_OK) {
        printf("Failed to create alarm MQTT task\n");
    }
}

APP_FEATURE_INIT(TongxiaoAlarmStart);
