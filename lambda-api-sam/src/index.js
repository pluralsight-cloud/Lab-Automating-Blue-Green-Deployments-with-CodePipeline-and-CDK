exports.handler = async (event) => {

    if (!process.env.ERROR) {
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: 'Hello globomantics',
                data: {
                    id: 1,
                    name: 'Sample Item',
                    active: true
                }
            })
        };
    } else
    {
       throw new Error("Something wrong with the code")

    }
};