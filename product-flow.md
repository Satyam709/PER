# Portable Execution Runtime

## Core Flow:

1. EntryPoint: By pressing on the `Select Kernel` option 

![Screenshot_20260126_112439.png](attachment:2321fd21-5013-4fa6-80b1-bb633d174de4:Screenshot_20260126_112439.png)

- will modify this menu to replace the colab with PER.

1. Upon clicking the per option we give a similar menu to above with following options:
    - Colab ⇒ like the one existed at previous level
    - Custom Instance
    - Storage Provider ⇒all config and setup for the storage service linking

## Sub Flows:

### 1. Colab:

Very similar to what colab extension currently provides just minor addons as:

- very first menu would be a account manager, having a simple option to add account
- we can keep adding accounts and show the ones successfully added, pretty much as we have in a typical google app.
- upon selecting the account we move to the below screen to configure the server options.

![Screenshot_20260126_112501.png](attachment:34e74d2a-3531-4e97-9413-bcafffdf26fd:Screenshot_20260126_112501.png)

- next we setup everything on server side plus your storage(if configured for proj) and boom!
    
    you feel as if running normally.
    

### 2. Custom Instance:

We can have many options here to setup and configure a custom compute unit:

- We decided the one with zero or minimal config (will give advanced options for pro users).
- A menu to enter the **public ip** for the the instance
- Some processing is shown to user, while we setup the instance, After auto configuring the same, will just connect to the instance and jupyter kernel.

**Advanced Options**: will support later on to tweak some of the config decisions.

### 3. Storage Config:

This is the crucial option for configuring and managing all of the cloud storage operations.

Menu Options:

- Give the `rclone` config path or file with the available cloud storage auth tokens.
- next menu : The root folder to use at cloud storage, say `drive:/projects/proj1`
    - This the exact folder we will keep in sync to the jupyter servers host project data folder.
    
    > Note: will  have to provide some kinda security mechanism to avoid wrong dir selection like this root proj  to avoid unintensional change and polluting of the cloud folder. To fix this we can persist this info at the local workspace than propagate this one whenever we switch the kernel.
    > 

## Some custom options:

Upon connecting the kernel we will give a external options at top of notebook to `sync storage` this will manually trigger a sync at server.

- if the storage options havent been configured yet we redirect there to configure them first.

### I think this is enough for v1.

> This is my understanding and visualization about the project. Feel free to suggest some changes to the usage flow.
>